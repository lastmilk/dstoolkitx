import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/git/git_service.dart';
import '../../data/local/git_cred_store.dart';
import '../../data/models/models.dart';
import '../auth/auth_controller.dart';
import 'git_sync_flow.dart';

/// Git 中心：Git 推送用户名 / Git APIKey 管理 / 本机凭证 / 对话容器全量同步
class GitCenterPage extends ConsumerStatefulWidget {
  const GitCenterPage({super.key});

  @override
  ConsumerState<GitCenterPage> createState() => _GitCenterPageState();
}

class _GitCenterPageState extends ConsumerState<GitCenterPage> {
  List<DeepseekConfig>? _configs;
  ({String? gitUsername, bool needsGitUsername, List<GitKeyItem> keys})? _keys;
  GitCred? _savedCred;
  bool _loading = true;
  String? _error;
  int _syncingContainerId = -1;
  String _progress = '';

  final _usernameController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(v1ApiProvider);
      final keys = await api.gitKeys();
      final configs = await api.configs();
      final cred = await ref.read(gitCredStoreProvider).read();
      if (!mounted) return;
      setState(() {
        _keys = keys;
        _configs = configs;
        _savedCred = cred;
        _usernameController.text = keys.gitUsername ?? '';
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '加载失败：$e';
        _loading = false;
      });
    }
  }

  Future<void> _saveUsername() async {
    final name = _usernameController.text.trim();
    if (!isValidGitUsername(name)) {
      _toast('Git 用户名只能包含英文、数字、下划线（3-32 位）');
      return;
    }
    try {
      await ref.read(v1ApiProvider).setGitUsername(name);
      _toast('Git 推送用户名已设置');
      await _load();
    } catch (e) {
      _toast('保存失败：$e');
    }
  }

  Future<void> _createKey() async {
    final configs = _configs ?? const <DeepseekConfig>[];
    if (configs.isEmpty) {
      _toast('请先创建对话容器');
      return;
    }
    var selectedId = configs.first.id;
    final nameController = TextEditingController(text: 'flutter-key');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: const Text('生成 Git APIKey'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(
                  labelText: '名称',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                initialValue: selectedId,
                decoration: const InputDecoration(
                  labelText: '授权容器（容器级，推荐）',
                  border: OutlineInputBorder(),
                ),
                items: [
                  for (final c in configs)
                    DropdownMenuItem(value: c.id, child: Text(c.name)),
                ],
                onChanged: (v) => setState(() => selectedId = v ?? selectedId),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('取消')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('生成')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      final created = await ref.read(v1ApiProvider).createGitKey(
            name: nameController.text.trim().isEmpty
                ? 'flutter-key'
                : nameController.text.trim(),
            containerId: selectedId,
          );
      await ref.read(gitCredStoreProvider).save(GitCred(
            gitUsername: _keys?.gitUsername ?? '',
            apiKey: created.key,
            keyId: created.id,
            scope: 'container',
            containerId: created.containerId,
          ));
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Git APIKey 已生成'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('明文仅显示一次，请立即复制保存：'),
              const SizedBox(height: 8),
              SelectableText(
                created.key,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
            ],
          ),
          actions: [
            FilledButton(
                onPressed: () => Navigator.pop(ctx), child: const Text('已保存')),
          ],
        ),
      );
      await _load();
    } catch (e) {
      _toast('生成失败：$e');
    }
  }

  Future<void> _revokeKey(GitKeyItem key) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('撤销 Git APIKey'),
        content: Text('撤销后立即失效，不可恢复。确定撤销「${key.name}」？'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('取消')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('撤销')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(v1ApiProvider).deleteGitKey(key.id);
      _toast('Key 已撤销');
      await _load();
    } catch (e) {
      _toast('撤销失败：$e');
    }
  }

  Future<void> _clearCred() async {
    await ref.read(gitCredStoreProvider).clear();
    await _load();
    _toast('已清除本机保存的 Git 凭证');
  }

  Future<void> _syncContainer(DeepseekConfig c) async {
    if (_syncingContainerId == c.id) return;
    setState(() => _syncingContainerId = c.id);
    try {
      await runContainerSync(context, ref,
          container: c,
          onProgress: (s) => mounted ? setState(() => _progress = s) : null);
    } finally {
      if (mounted) {
        setState(() {
          _syncingContainerId = -1;
          _progress = '';
        });
      }
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final neu = _flat(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Git 同步中心')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? ListView(padding: const EdgeInsets.all(16), children: [
                  Card(
                      child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_error!),
                  )),
                ])
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _card(
                        neu: neu,
                        icon: Icons.badge_outlined,
                        title: 'Git 推送用户名',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                                'Git 推送/拉取使用「Git 用户名 + Git APIKey」Basic 鉴权。'
                                '标准 Git 客户端亦可接入：'),
                            const SizedBox(height: 4),
                            SelectableText(
                              'git clone http://<Git用户名>:<dstkg_ APIKey>@<host>/git/u<userId>_c<containerId>.git',
                              style: TextStyle(
                                fontFamily: 'monospace',
                                fontSize: 11,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _usernameController,
                                    enabled: _keys?.needsGitUsername == true ||
                                        _keys?.gitUsername == null,
                                    decoration: const InputDecoration(
                                      hintText: '3-32 位：英文、数字、下划线',
                                      isDense: true,
                                      border: OutlineInputBorder(),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                FilledButton.tonal(
                                  onPressed: _saveUsername,
                                  child: const Text('保存'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      _card(
                        neu: neu,
                        icon: Icons.key_rounded,
                        title: 'Git APIKey',
                        trailing: FilledButton.tonalIcon(
                          onPressed: _createKey,
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('生成'),
                        ),
                        child: Column(
                          children: [
                            for (final k in _keys?.keys ?? const <GitKeyItem>[])
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                dense: true,
                                title: Text(
                                  k.name,
                                  style: TextStyle(
                                    decoration: k.isRevoked
                                        ? TextDecoration.lineThrough
                                        : null,
                                  ),
                                ),
                                subtitle: Text(
                                  '${k.masked} · ${k.scope == 'global' ? '全局' : '容器 ${k.containerId}'}'
                                  '${k.isExpired ? ' · 已过期' : ''}',
                                  style: const TextStyle(fontSize: 11),
                                ),
                                trailing: k.isRevoked
                                    ? const Text('已撤销',
                                        style: TextStyle(fontSize: 11))
                                    : IconButton(
                                        icon: const Icon(Icons.delete_outline,
                                            size: 20),
                                        onPressed: () => _revokeKey(k),
                                      ),
                              ),
                            if ((_keys?.keys.isEmpty ?? true))
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 8),
                                child: Text('暂无 Git APIKey'),
                              ),
                          ],
                        ),
                      ),
                      _card(
                        neu: neu,
                        icon: Icons.phone_android_rounded,
                        title: '本机凭证',
                        child: _savedCred == null
                            ? const Text('未保存。Git 推送时会引导生成/输入。',
                                style: TextStyle(fontSize: 12))
                            : Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '用户名 ${_savedCred!.gitUsername} · '
                                      '${_savedCred!.scope == 'global' ? '全局 Key' : '容器级 Key'}'
                                      '${_savedCred!.containerId != null ? ' #${_savedCred!.containerId}' : ''}',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: _clearCred,
                                    child: const Text('清除'),
                                  ),
                                ],
                              ),
                      ),
                      _card(
                        neu: neu,
                        icon: Icons.folder_copy_outlined,
                        title: '对话容器同步',
                        child: Column(
                          children: [
                            if (_progress.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  children: [
                                    const SizedBox(
                                      width: 14,
                                      height: 14,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(_progress,
                                          style: const TextStyle(fontSize: 11)),
                                    ),
                                  ],
                                ),
                              ),
                            for (final c
                                in _configs ?? const <DeepseekConfig>[])
                              ListTile(
                                contentPadding: EdgeInsets.zero,
                                dense: true,
                                title: Text(c.name),
                                subtitle: Text(
                                  '${c.conversationCount} 个对话 · u${_userIdOf(c)}',
                                  style: const TextStyle(fontSize: 11),
                                ),
                                trailing: _syncingContainerId == c.id
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2),
                                      )
                                    : FilledButton.tonal(
                                        onPressed: () => _syncContainer(c),
                                        child: const Text('同步'),
                                      ),
                              ),
                            if ((_configs?.isEmpty ?? true))
                              const Text('暂无对话容器'),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
    );
  }

  String _userIdOf(DeepseekConfig c) {
    final id = c.deepseekUserId;
    return id.length > 8 ? '${id.substring(0, 8)}…' : id;
  }
}

class _Neu {
  final Color surface;
  _Neu(this.surface);
}

_Neu _flat(BuildContext context) => _Neu(Theme.of(context).colorScheme.surface);

Widget _card({
  required _Neu neu,
  required IconData icon,
  required String title,
  required Widget child,
  Widget? trailing,
}) {
  return Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: neu.surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.black.withValues(alpha: 0.04)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 20, color: Colors.indigo),
            const SizedBox(width: 8),
            Expanded(
              child: Text(title,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 15)),
            ),
            if (trailing != null) trailing,
          ],
        ),
        const SizedBox(height: 10),
        child,
      ],
    ),
  );
}
