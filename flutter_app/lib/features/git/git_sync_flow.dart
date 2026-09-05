/// Git 同步 UI 编排：会话凭证直连（免 GitUsername/APIKey）→ 同步 → 冲突裁决 → 结果提示。
/// 对话详情页（增量）与 Git 中心页（容器全量）共用。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/git/git_service.dart';
import '../../data/local/git_cred_store.dart';
import '../../data/models/models.dart';
import '../auth/auth_controller.dart';
import 'git_conflict_sheet.dart';

final gitCredStoreProvider = Provider<GitCredStore>((ref) => GitCredStore());

/// 完整准备流程：git-info → 登录态 dstk_ 访问令牌直连。
/// 内置同步免 GitUsername / dstkg_ APIKey（仅第三方 Git 客户端才需要）。
/// 返回 null 表示不可同步（未登录/容器不存在）。
Future<GitReady?> ensureGitReady(
  BuildContext context,
  WidgetRef ref, {
  required int configId,
  DeepseekConfig? container,
}) async {
  final api = ref.read(v1ApiProvider);
  try {
    final cfg = container ??
        (await api.configs()).where((c) => c.id == configId).firstOrNull;
    if (cfg == null) {
      if (context.mounted) {
        _toast(context, '对话容器不存在');
      }
      return null;
    }
    final info = await api.gitInfo(configId);
    final access = await ref.read(tokenProviderProvider).readAccess();
    if (access == null || access.isEmpty) {
      if (context.mounted) {
        _toast(context, '登录已过期，请重新登录后再同步');
      }
      return null;
    }
    return GitReady(
      repoUrl: info.repoUrl,
      repoId: repoIdFromUrl(info.repoUrl),
      containerName: cfg.name,
      deepseekUserId: cfg.deepseekUserId,
      gitUsername: info.gitUsername ?? 'dstoolkit',
      apiKey: access, // Basic 密码 = 会话凭证，服务端识别后免 dstkg_ APIKey
    );
  } catch (e) {
    if (context.mounted) {
      _toast(context, 'Git 准备失败：${_errMsg(e)}');
    }
    return null;
  }
}

/// 单个对话增量同步（对话详情页入口）
Future<void> runConversationIncrementalSync(
  BuildContext context,
  WidgetRef ref, {
  required int configId,
  required ConversationDetail detail,
  DeepseekConfig? container,
}) async {
  final ready = await ensureGitReady(context, ref,
      configId: configId, container: container);
  if (ready == null || !context.mounted) return;
  await _runWithSheet(
    context,
    () => syncSingleConversation(
      SyncSingleOptions(
        configId: configId,
        containerName: ready.containerName,
        deepseekUserId: ready.deepseekUserId,
        repoUrl: ready.repoUrl,
        conversation: detail,
        gitUsername: ready.gitUsername,
        apiKey: ready.apiKey,
      ),
      ref.read(gitCredStoreProvider),
    ),
    context,
    ref,
    ready,
  );
}

/// 全量容器同步（Git 中心页入口）
Future<void> runContainerSync(
  BuildContext context,
  WidgetRef ref, {
  required DeepseekConfig container,
  void Function(String)? onProgress,
}) async {
  final ready = await ensureGitReady(context, ref,
      configId: container.id, container: container);
  if (ready == null || !context.mounted) return;

  final api = ref.read(v1ApiProvider);
  try {
    onProgress?.call('正在加载对话列表…');
    // 全量拉取 lite 分页
    final convs = <ConversationLite>[];
    var page = 1;
    while (true) {
      final p = await api.conversations(
          configId: container.id, page: page, pageSize: 100);
      convs.addAll(p.records);
      if (p.records.length < p.pageSize || convs.length >= p.total) break;
      page++;
    }
    // 逐个取详情（Git 仓库需要完整消息）
    final details = <ConversationDetail>[];
    var i = 0;
    for (final c in convs) {
      i++;
      onProgress?.call('加载对话 ($i/${convs.length})：${c.title}');
      details.add(await api.conversationDetail(
        configId: container.id,
        convId: c.deepseekConvId,
      ));
    }
    onProgress?.call('正在 Git 推送…');
    if (!context.mounted) return;
    await _runWithSheet(
      context,
      () => syncContainer(
        SyncContainerOptions(
          configId: container.id,
          containerName: ready.containerName,
          deepseekUserId: ready.deepseekUserId,
          repoUrl: ready.repoUrl,
          conversations: details,
          gitUsername: ready.gitUsername,
          apiKey: ready.apiKey,
        ),
        ref.read(gitCredStoreProvider),
      ),
      context,
      ref,
      ready,
    );
  } catch (e) {
    if (context.mounted) _toast(context, '容器同步失败：${_errMsg(e)}');
  }
}

Future<void> _runWithSheet(
  BuildContext context,
  Future<GitSyncOutcome> Function() task,
  BuildContext dialogContext,
  WidgetRef ref,
  GitReady ready,
) async {
  // 进度提示
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => const AlertDialog(
      content: SizedBox(
        width: 64,
        height: 64,
        child: Center(child: CircularProgressIndicator()),
      ),
    ),
  );
  GitSyncOutcome outcome;
  try {
    outcome = await task();
  } catch (e) {
    if (context.mounted) {
      Navigator.of(context, rootNavigator: true).pop(); // 关进度
      _toast(context, 'Git 同步失败：${_errMsg(e)}');
    }
    return;
  }
  if (!context.mounted) return;
  Navigator.of(context, rootNavigator: true).pop(); // 关进度

  if (outcome is GitUpToDate) {
    _toast(context, '已是最新，无需同步');
    return;
  }
  if (outcome is GitConflicts) {
    final resolutions = await showGitConflictSheet(
      context,
      containerName: ready.containerName,
      conflicts: outcome.ctx.conflicts,
    );
    if (resolutions == null || !context.mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const AlertDialog(
        content: SizedBox(
          width: 64,
          height: 64,
          child: Center(child: CircularProgressIndicator()),
        ),
      ),
    );
    GitSyncOutcome finalOutcome;
    try {
      finalOutcome = await resolveConflicts(
        outcome.ctx,
        resolutions,
        ref.read(gitCredStoreProvider),
      );
    } catch (e) {
      if (context.mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        _toast(context, 'Git 推送失败：${_errMsg(e)}');
      }
      return;
    }
    if (!context.mounted) return;
    Navigator.of(context, rootNavigator: true).pop();
    if (finalOutcome is GitPushed) {
      _toast(context, '已推送 ${finalOutcome.pushed} 个文件（冲突已按你的选择处理）');
    } else {
      _toast(context, '同步完成');
    }
    return;
  }
  if (outcome is GitPushed) {
    _toast(context, '已推送 ${outcome.pushed} 个文件到远端仓库');
  }
}

void _toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

String _errMsg(Object e) {
  final s = e.toString();
  return s.length > 120 ? '${s.substring(0, 120)}…' : s;
}
