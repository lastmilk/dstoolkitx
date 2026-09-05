/// Flutter 端 Git 同步引擎（git2dart / libgit2）。
///
/// 与 Web 端 isomorphic-git 实现同一套仓库协议（服务端 pre-receive 白名单校验）：
///   container.json               { name, deepseekUserId }
///   conversations/`<convId>`.json  { deepseekConvId, title, inserted_at, updated_at, messages }
///
/// 同步模型（文件级三方合并：本地数据源 / 基线 commit / 远端 HEAD）：
///   - 本地 == 基线，远端有变化   → 采用远端
///   - 远端 == 基线，本地有变化   → 推送本地变更
///   - 双方都有变化且内容不同     → 冲突，交由 UI 三选一（本地/远端/智能合并）
///   - 基线 = 上次成功同步后的远端 HEAD（安全存储记账）；首次同步视远端为基线
///
/// 智能合并（对话 JSON）：messages 数组按 nodeId 并集后按 insertedAt 排序。
library;

import 'dart:convert';
import 'dart:io';

import 'package:git2dart/git2dart.dart';
import 'package:git2dart_binaries/git2dart_binaries.dart' show LibGit2Error;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../../core/constants/api_constants.dart';
import '../local/git_cred_store.dart';
import '../models/models.dart';

const _authorEmailDomain = 'git.dstoolkit.local';

final RegExp _gitUsernameRe = RegExp(r'^[A-Za-z0-9_]{3,32}$');

bool isValidGitUsername(String name) => _gitUsernameRe.hasMatch(name);

/// API 基址 → Git 服务源（apiBase 去掉 /api 后缀）
String gitOrigin() {
  final base = ApiConstants.apiBase;
  return base.endsWith('/api') ? base.substring(0, base.length - 4) : base;
}

String repoIdFromUrl(String repoUrl) =>
    repoUrl.replaceAll(RegExp(r'^.*/'), '').replaceAll(RegExp(r'\.git$'), '');

// ─────────── 冲突与结果模型 ───────────

typedef ConflictResolution = String; // 'local' | 'remote' | 'smart'

class GitConflict {
  GitConflict({
    required this.path,
    required this.convId,
    required this.title,
    required this.localSummary,
    required this.remoteSummary,
    this.localContent,
    this.remoteContent,
    this.baseContent,
  });

  final String path; // conversations/<id>.json
  final String convId;
  final String title;
  final ({int turns, String updatedAt}) localSummary;
  final ({int turns, String updatedAt}) remoteSummary;
  final String? localContent; // null = 本地已删除
  final String? remoteContent; // null = 远端已删除
  final String? baseContent;
}

/// 冲突待处理时挂起的同步上下文（resolveConflicts 后继续推送）
class GitSyncContext {
  GitSyncContext({
    required this.repoPath,
    required this.url,
    required this.gitUsername,
    required this.apiKey,
    required this.containerName,
    required this.configId,
    required this.deepseekUserId,
    required this.baseSha,
    required this.remoteSha,
    required this.localTree,
    required this.staged,
    required this.conflicts,
    required this.commitMessage,
  });

  final String repoPath; // 本地仓库工作目录
  final String url; // 远端仓库 URL
  final String gitUsername;
  final String apiKey;
  final String containerName;
  final int configId;
  final String deepseekUserId;
  final String? baseSha;
  final String? remoteSha;
  final Map<String, String> localTree; // 本地数据源构建的完整树
  final Map<String, String?> staged; // 非冲突部分的三方裁决
  final List<GitConflict> conflicts;
  final String commitMessage;
}

sealed class GitSyncOutcome {
  const GitSyncOutcome();
}

class GitUpToDate extends GitSyncOutcome {
  const GitUpToDate(this.commit);
  final String? commit;
}

class GitPushed extends GitSyncOutcome {
  const GitPushed(this.commit, this.pushed);
  final String commit;
  final int pushed;
}

class GitConflicts extends GitSyncOutcome {
  const GitConflicts(this.ctx);
  final GitSyncContext ctx;
}

// ─────────── 对话 JSON 构建 ───────────

String _iso(DateTime? v) => (v ?? DateTime.now().toUtc()).toIso8601String();

/// 云端详情（无 mapping）→ 扁平 messages 数组格式（服务端同样接受）
String convToJson(ConversationDetail d) => jsonEncode({
      'deepseekConvId': d.deepseekConvId,
      'title': d.title,
      'inserted_at': _iso(
        d.messages.isNotEmpty ? d.messages.first.insertedAt : d.updatedAt,
      ),
      'updated_at': _iso(d.updatedAt),
      'messages': [
        for (final m in d.messages)
          {
            'nodeId': m.nodeId,
            'parentId': m.parentId,
            'role': m.role,
            'model': m.model,
            'content': m.content,
            'insertedAt': _iso(m.insertedAt),
          },
      ],
    });

String containerToJson(String name, String deepseekUserId) =>
    jsonEncode({'name': name, 'deepseekUserId': deepseekUserId});

({int turns, String updatedAt}) _convSummary(String? content) {
  if (content == null) return (turns: 0, updatedAt: '');
  try {
    final json = jsonDecode(content);
    if (json is! Map<String, dynamic>) return (turns: 0, updatedAt: '');
    final messages = json['messages'];
    var turns = 0;
    if (messages is List) {
      for (final m in messages) {
        if (m is Map && m['role'] == 'USER') turns++;
      }
    }
    return (turns: turns, updatedAt: json['updated_at']?.toString() ?? '');
  } catch (_) {
    return (turns: 0, updatedAt: '');
  }
}

/// 智能合并对话 JSON：messages 按 nodeId 并集后按时间排序；不可合并返回 null
String? smartMergeConversation(
    String? baseJson, String? localJson, String? remoteJson) {
  if (localJson == null || remoteJson == null) return null;
  try {
    final base = baseJson != null
        ? jsonDecode(baseJson) as Map<String, dynamic>
        : <String, dynamic>{};
    final local = jsonDecode(localJson);
    final remote = jsonDecode(remoteJson);
    if (local is! Map || remote is! Map) return null;

    List<dynamic> collectMessages(Map<dynamic, dynamic> src) {
      final baseMsgs = base['messages'];
      return [
        if (src['messages'] is List) ...(src['messages'] as List),
        if (baseMsgs is List && src['messages'] is List)
          ...(baseMsgs).where((m) =>
              m is Map &&
              !(src['messages'] as List)
                  .any((x) => x is Map && x['nodeId'] == m['nodeId'])),
      ];
    }

    if (local['messages'] is List && remote['messages'] is List) {
      final byId = <String, dynamic>{};
      for (final m in collectMessages(local)) {
        if (m is Map && m['nodeId'] is String) byId[m['nodeId'] as String] = m;
      }
      for (final m in collectMessages(remote)) {
        if (m is Map && m['nodeId'] is String) {
          byId.putIfAbsent(m['nodeId'] as String, () => m);
        }
      }
      final merged = <String, dynamic>{...remote.cast<String, dynamic>()};
      merged['messages'] = byId.values.toList()
        ..sort((a, b) => (a is Map ? '${a['insertedAt']}' : '')
            .compareTo(b is Map ? '${b['insertedAt']}' : ''));
      final lu = '${local['updated_at']}';
      final ru = '${remote['updated_at']}';
      if (lu.compareTo(ru) >= 0) merged['updated_at'] = local['updated_at'];
      return jsonEncode(merged);
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ─────────── 三方分类（与 Web classifyThreeWay 对齐） ───────────

({Map<String, String?> staged, List<GitConflict> conflicts, int pushed})
    _classifyThreeWay(
  Map<String, String> localTree,
  Map<String, String>? baseTree,
  Map<String, String>? remoteTree,
) {
  final staged = <String, String?>{};
  final conflicts = <GitConflict>[];
  var pushed = 0;
  final paths = <String>{
    ...localTree.keys,
    ...?baseTree?.keys,
    ...?remoteTree?.keys,
  };
  for (final path in paths) {
    final local = localTree[path];
    final base = baseTree?[path];
    final remote = remoteTree?[path];
    if (local == remote) continue; // 双方一致
    if (local == base) {
      // 本地无变化 → 采用远端
      staged[path] = remote;
      continue;
    }
    if (remote == base) {
      // 远端无变化 → 推送本地（null = 本地已删除）
      staged[path] = local;
      pushed++;
      continue;
    }
    // 双方都变了且不同 → 冲突
    final m = RegExp(r'^conversations/(.+)\.json$').firstMatch(path);
    final localJson = local != null ? _tryDecode(local) : null;
    final remoteJson = remote != null ? _tryDecode(remote) : null;
    conflicts.add(GitConflict(
      path: path,
      convId: m?.group(1) ?? path,
      title: localJson?['title']?.toString() ??
          remoteJson?['title']?.toString() ??
          path,
      localSummary: _convSummary(local),
      remoteSummary: _convSummary(remote),
      localContent: local,
      remoteContent: remote,
      baseContent: base,
    ));
  }
  return (staged: staged, conflicts: conflicts, pushed: pushed);
}

Map<String, dynamic>? _tryDecode(String s) {
  try {
    final v = jsonDecode(s);
    return v is Map<String, dynamic> ? v : null;
  } catch (_) {
    return null;
  }
}

// ─────────── git2dart 仓库操作 ───────────

Future<String> _repoBaseDir() {
  return getApplicationDocumentsDirectory()
      .then((d) => p.join(d.path, 'git-repos'));
}

Future<({Repository repo, String path, String? remoteSha, bool fresh})>
    _ensureRepoReady({
  required String repoId,
  required String url,
  required String username,
  required String password,
}) async {
  final base = await _repoBaseDir();
  final dirPath = p.join(base, repoId);
  final creds = UserPass(username: username, password: password);
  final gitDir = Directory(p.join(dirPath, '.git'));

  Repository repo;
  var fresh = false;
  if (gitDir.existsSync()) {
    repo = Repository.open(dirPath);
  } else {
    try {
      repo = Repository.clone(
        url: url,
        localPath: dirPath,
        callbacks: Callbacks(credentials: creds),
      );
      fresh = true;
    } on LibGit2Error catch (e) {
      // 远端仓库不存在（404）或为空 → 本地 init
      if (!_isNotFound(e.message)) rethrow;
      Directory(dirPath).createSync(recursive: true);
      repo = Repository.init(path: dirPath);
      repo.setHead('refs/heads/main');
    }
  }

  final remoteSha = await _fetchRemoteHead(
    repo: repo,
    url: url,
    username: username,
    password: password,
  );
  return (repo: repo, path: dirPath, remoteSha: remoteSha, fresh: fresh);
}

bool _isNotFound(String message) =>
    message.contains('404') ||
    message.toLowerCase().contains('not found') ||
    message.toLowerCase().contains('is empty');

Future<String?> _fetchRemoteHead({
  required Repository repo,
  required String url,
  required String username,
  required String password,
}) async {
  final creds = UserPass(username: username, password: password);
  Remote remote;
  if (repo.remotes.contains('origin')) {
    Remote.setUrl(repo: repo, remote: 'origin', url: url);
    remote = Remote.lookup(repo: repo, name: 'origin');
  } else {
    remote = Remote.create(repo: repo, name: 'origin', url: url);
  }
  try {
    remote.fetch(callbacks: Callbacks(credentials: creds));
  } on LibGit2Error catch (e) {
    if (_isNotFound(e.message)) return null; // 远端为空/不存在
    rethrow;
  }
  for (final ref in const [
    'refs/remotes/origin/main',
    'refs/remotes/origin/master',
  ]) {
    try {
      return Reference.lookup(repo: repo, name: ref).target.sha;
    } catch (_) {
      // 尝试下一个
    }
  }
  return null;
}

/// 读取某 commit 树下的全部文件（本仓库只存少量 JSON，直接全量展开）
Map<String, String> _readTreeFiles(Repository repo, String sha) {
  final out = <String, String>{};
  final commit = Commit.lookup(repo: repo, oid: Oid.fromSHA(repo, sha));
  try {
    final root = commit.tree;
    void walk(Tree tree, String prefix) {
      for (final entry in tree.entries) {
        final path = prefix.isEmpty ? entry.name : '$prefix/${entry.name}';
        if (entry.type == GitObject.tree) {
          final sub = Tree.lookup(repo: repo, oid: entry.oid);
          try {
            walk(sub, path);
          } finally {
            sub.free();
          }
        } else if (entry.type == GitObject.blob) {
          final blob = Blob.lookup(repo: repo, oid: entry.oid);
          try {
            out[path] = blob.content;
          } finally {
            blob.free();
          }
        }
      }
    }

    try {
      walk(root, '');
    } finally {
      root.free();
    }
  } finally {
    commit.free();
  }
  return out;
}

String? _readTreeFile(Repository repo, String sha, String filepath) {
  try {
    final commit = Commit.lookup(repo: repo, oid: Oid.fromSHA(repo, sha));
    try {
      final root = commit.tree;
      try {
        final blob = Blob.lookup(repo: repo, oid: root[filepath].oid);
        try {
          return blob.content;
        } finally {
          blob.free();
        }
      } finally {
        root.free();
      }
    } finally {
      commit.free();
    }
  } catch (_) {
    return null;
  }
}

({String commit}) _commitAndPush({
  required Repository repo,
  required String repoPath,
  required String url,
  required String username,
  required String password,
  required Map<String, String?> staged,
  required String message,
}) {
  final creds = UserPass(username: username, password: password);
  final workdir = repo.workdir;
  final index = repo.index;
  for (final entry in staged.entries) {
    if (entry.value == null) {
      final f = File(p.join(workdir, entry.key));
      if (f.existsSync()) f.deleteSync();
      try {
        index.remove(entry.key);
      } catch (_) {
        try {
          index.removeAll([entry.key]);
        } catch (_) {
          // 文件本就不在索引中
        }
      }
      continue;
    }
    final f = File(p.join(workdir, entry.key));
    f.parent.createSync(recursive: true);
    f.writeAsStringSync(entry.value!);
    index.add(entry.key);
  }
  index.write();

  final tree = Tree.lookup(repo: repo, oid: index.writeTree(repo));
  try {
    final sig = Signature.create(
      name: username,
      email: '$username@$_authorEmailDomain',
    );
    String? parentSha;
    try {
      parentSha = repo.head.target.sha;
    } catch (_) {
      // 分支未出生（首个提交）
    }
    final parents = parentSha == null
        ? <Commit>[]
        : [Commit.lookup(repo: repo, oid: Oid.fromSHA(repo, parentSha))];
    try {
      Commit.create(
        repo: repo,
        updateRef: 'refs/heads/main',
        author: sig,
        committer: sig,
        message: message,
        tree: tree,
        parents: parents,
      );
    } finally {
      for (final c in parents) {
        c.free();
      }
    }
  } finally {
    tree.free();
  }

  final remote = repo.remotes.contains('origin')
      ? Remote.lookup(repo: repo, name: 'origin')
      : Remote.create(repo: repo, name: 'origin', url: url);
  remote.push(
    refspecs: const ['refs/heads/main'],
    callbacks: Callbacks(
      credentials: creds,
      pushUpdateReference: (refname, message) {
        if (message.isNotEmpty) {
          throw StateError('push rejected: $message');
        }
      },
    ),
  );
  return (commit: repo.head.target.sha);
}

bool _isNonFastForward(String message) => RegExp(
      r'fetch first|not a fast|fast-forward|not an ancestor|rejected',
      caseSensitive: false,
    ).hasMatch(message);

// ─────────── 全量容器同步 ───────────

class SyncContainerOptions {
  SyncContainerOptions({
    required this.configId,
    required this.containerName,
    required this.deepseekUserId,
    required this.repoUrl,
    required this.conversations,
    required this.gitUsername,
    required this.apiKey,
    this.commitMessage,
  });

  final int configId;
  final String containerName;
  final String deepseekUserId;
  final String repoUrl;
  final List<ConversationDetail> conversations;
  final String gitUsername;
  final String apiKey;
  final String? commitMessage;
}

/// 全量同步对话容器；存在冲突时返回 [GitConflicts] 交由 UI 裁决
Future<GitSyncOutcome> syncContainer(
  SyncContainerOptions o,
  GitCredStore credStore,
) async {
  final repoId = repoIdFromUrl(o.repoUrl);
  final url = '${gitOrigin()}${o.repoUrl}';
  final ready = await _ensureRepoReady(
    repoId: repoId,
    url: url,
    username: o.gitUsername,
    password: o.apiKey,
  );
  final repo = ready.repo;
  try {
    final remoteSha = ready.remoteSha;
    final baseSha = await credStore.readBaseCommit(repoId);

    final localTree = <String, String>{
      'container.json': containerToJson(o.containerName, o.deepseekUserId),
      for (final c in o.conversations)
        'conversations/${c.deepseekConvId}.json': convToJson(c),
    };

    final remoteTree =
        remoteSha != null ? _readTreeFiles(repo, remoteSha) : null;
    Map<String, String>? baseTree;
    if (baseSha != null && baseSha != remoteSha) {
      try {
        baseTree = _readTreeFiles(repo, baseSha);
      } catch (_) {
        baseTree = remoteTree;
      }
    } else {
      baseTree = remoteTree;
    }

    final r = _classifyThreeWay(localTree, baseTree, remoteTree);
    if (r.staged.isEmpty && r.conflicts.isEmpty) {
      return GitUpToDate(remoteSha);
    }
    final ctx = GitSyncContext(
      repoPath: ready.path,
      url: url,
      gitUsername: o.gitUsername,
      apiKey: o.apiKey,
      containerName: o.containerName,
      configId: o.configId,
      deepseekUserId: o.deepseekUserId,
      baseSha: baseSha,
      remoteSha: remoteSha,
      localTree: localTree,
      staged: r.staged,
      conflicts: r.conflicts,
      commitMessage: o.commitMessage ?? '同步对话容器: ${o.containerName}',
    );
    if (r.conflicts.isNotEmpty) return GitConflicts(ctx);
    return await _finishSync(ctx, repo, credStore, {});
  } finally {
    repo.free();
  }
}

// ─────────── 单个对话增量同步 ───────────

class SyncSingleOptions {
  SyncSingleOptions({
    required this.configId,
    required this.containerName,
    required this.deepseekUserId,
    required this.repoUrl,
    required this.conversation,
    required this.gitUsername,
    required this.apiKey,
  });

  final int configId;
  final String containerName;
  final String deepseekUserId;
  final String repoUrl;
  final ConversationDetail conversation;
  final String gitUsername;
  final String apiKey;
}

/// 增量同步单个对话：只改动 conversations/`<id>`.json 一个文件
/// （远端仓库缺失时以 container.json + 该对话初始化仓库）
Future<GitSyncOutcome> syncSingleConversation(
  SyncSingleOptions o,
  GitCredStore credStore,
) async {
  final repoId = repoIdFromUrl(o.repoUrl);
  final url = '${gitOrigin()}${o.repoUrl}';
  final ready = await _ensureRepoReady(
    repoId: repoId,
    url: url,
    username: o.gitUsername,
    password: o.apiKey,
  );
  final repo = ready.repo;
  try {
    final remoteSha = ready.remoteSha;
    final path = 'conversations/${o.conversation.deepseekConvId}.json';
    final localContent = convToJson(o.conversation);
    final staged = <String, String?>{};
    final conflicts = <GitConflict>[];
    Map<String, String>? remoteTree;

    if (remoteSha == null) {
      staged['container.json'] =
          containerToJson(o.containerName, o.deepseekUserId);
      staged[path] = localContent;
    } else {
      remoteTree = _readTreeFiles(repo, remoteSha);
      final remoteContent = remoteTree[path];
      if (remoteContent == localContent) {
        return GitUpToDate(remoteSha);
      }
      final baseSha = await credStore.readBaseCommit(repoId);
      String? baseContent;
      if (baseSha != null) {
        baseContent = _readTreeFile(repo, baseSha, path);
      }
      if (baseSha == null ||
          baseContent == remoteContent ||
          remoteContent == null) {
        // 远端自基线以来未动过该文件 → 直接增量推送本地版本
        staged[path] = localContent;
        if (!remoteTree.containsKey('container.json')) {
          staged['container.json'] =
              containerToJson(o.containerName, o.deepseekUserId);
        }
      } else {
        conflicts.add(GitConflict(
          path: path,
          convId: o.conversation.deepseekConvId,
          title: o.conversation.title,
          localSummary: _convSummary(localContent),
          remoteSummary: _convSummary(remoteContent),
          localContent: localContent,
          remoteContent: remoteContent,
          baseContent: baseContent,
        ));
      }
    }

    final ctx = GitSyncContext(
      repoPath: ready.path,
      url: url,
      gitUsername: o.gitUsername,
      apiKey: o.apiKey,
      containerName: o.containerName,
      configId: o.configId,
      deepseekUserId: o.deepseekUserId,
      baseSha: await credStore.readBaseCommit(repoId),
      remoteSha: remoteSha,
      localTree: {path: localContent},
      staged: staged,
      conflicts: conflicts,
      commitMessage: '增量同步: ${o.conversation.title}',
    );
    if (conflicts.isNotEmpty) return GitConflicts(ctx);
    return await _finishSync(ctx, repo, credStore, {});
  } finally {
    repo.free();
  }
}

// ─────────── 冲突裁决后完成推送 ───────────

Future<GitSyncOutcome> resolveConflicts(
  GitSyncContext ctx,
  Map<String, ConflictResolution> resolutions,
  GitCredStore credStore,
) async {
  final repo = Repository.open(ctx.repoPath);
  try {
    return await _finishSync(ctx, repo, credStore, resolutions);
  } finally {
    repo.free();
  }
}

Future<GitSyncOutcome> _finishSync(
  GitSyncContext ctx,
  Repository repo,
  GitCredStore credStore,
  Map<String, ConflictResolution> resolutions,
) async {
  final staged = <String, String?>{...ctx.staged};

  // 1. 冲突裁决（默认保留本地）
  for (final c in ctx.conflicts) {
    final r = resolutions[c.path] ?? 'local';
    if (r == 'remote') {
      staged[c.path] = c.remoteContent;
    } else if (r == 'smart') {
      final merged = smartMergeConversation(
          c.baseContent, c.localContent, c.remoteContent);
      staged[c.path] = merged ?? (ctx.localTree[c.path] ?? c.localContent);
    } else {
      staged[c.path] = ctx.localTree[c.path] ?? c.localContent;
    }
  }

  // 2. commit + push（非快进被拒 → 重跑一轮，最多 2 次）
  Object? lastError;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      final r = _commitAndPush(
        repo: repo,
        repoPath: ctx.repoPath,
        url: ctx.url,
        username: ctx.gitUsername,
        password: ctx.apiKey,
        staged: staged,
        message: ctx.commitMessage,
      );
      await credStore.setBaseCommit(repoIdFromUrl(ctx.url), r.commit);
      final pushed =
          staged.entries.where((e) => e.key != 'container.json').length;
      return GitPushed(r.commit, pushed);
    } catch (e) {
      lastError = e;
      final msg = e is LibGit2Error ? e.message : e.toString();
      if (_isNonFastForward(msg)) {
        // 远端在我们 fetch 之后又有新推送 → 重新对齐再试（本地优先）
        final freshSha = await _fetchRemoteHead(
          repo: repo,
          url: ctx.url,
          username: ctx.gitUsername,
          password: ctx.apiKey,
        );
        final remoteTree =
            freshSha != null ? _readTreeFiles(repo, freshSha) : null;
        final r = _classifyThreeWay(ctx.localTree, remoteTree, remoteTree);
        if (r.conflicts.isNotEmpty) break;
        staged
          ..clear()
          ..addAll(r.staged);
        continue;
      }
      rethrow;
    }
  }
  throw lastError ?? Exception('Git 同步失败');
}

// ─────────── 就绪结果（供 UI 层编排） ───────────

class GitReady {
  const GitReady({
    required this.repoUrl,
    required this.repoId,
    required this.containerName,
    required this.deepseekUserId,
    required this.gitUsername,
    required this.apiKey,
  });

  final String repoUrl;
  final String repoId;
  final String containerName;
  final String deepseekUserId;

  /// commit 作者名（仅展示用）
  final String gitUsername;

  /// Basic 密码 = 登录态 dstk_ 访问令牌（服务端识别会话凭证，
  /// 内置同步免 GitUsername / dstkg_ APIKey，后者仅第三方 Git 客户端需要）
  final String apiKey;
}
