import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/v1_api.dart';
import '../../data/models/models.dart';
import '../../features/auth/auth_controller.dart';

/// 导入页：分享链接增量导入 + 已导入对话列表
class ImportPage extends ConsumerStatefulWidget {
  const ImportPage({super.key});

  @override
  ConsumerState<ImportPage> createState() => _ImportPageState();
}

class _ImportPageState extends ConsumerState<ImportPage> {
  final _urlController = TextEditingController();
  final _conversations = <UnifiedConversation>[];
  var _loading = false;
  var _importing = false;
  V1Api get _api => ref.read(v1ApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _api.importedConversations();
      setState(() {
        _conversations
          ..clear()
          ..addAll(list);
      });
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('加载失败，请检查网络')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _import() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请输入分享链接')),
      );
      return;
    }
    setState(() => _importing = true);
    try {
      final res = await _api.importByShare(url);
      if (res['imported'] == true) {
        _urlController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('导入成功')),
        );
        _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['reason'] ?? '该对话已导入')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('导入失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  String _sourceLabel(String source) {
    switch (source) {
      case 'DEEPSEEK_SHARE':
        return 'DeepSeek 分享';
      case 'OPENAI_SHARE':
        return 'ChatGPT 分享';
      case 'DEEPSEEK_JSON':
        return 'DeepSeek JSON';
      case 'OPENAI_JSON':
        return 'OpenAI JSON';
      case 'CONTINUED':
        return '续聊';
      case 'AGENT':
        return 'Agent';
      default:
        return source;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('导入对话')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 分享链接导入
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '分享链接导入（增量）',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '粘贴 DeepSeek 或 ChatGPT 的对话分享链接',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _urlController,
                      decoration: const InputDecoration(
                        labelText: '分享链接',
                        hintText: 'https://chat.deepseek.com/...',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _importing ? null : _import,
                      icon: _importing
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.link),
                      label: Text(_importing ? '导入中...' : '导入对话'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            // 已导入列表
            Row(
              children: [
                const Text(
                  '已导入对话',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                Text('${_conversations.length} 段'),
              ],
            ),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_conversations.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(
                  child: Text(
                    '暂无导入对话\n粘贴上方分享链接开始导入',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              )
            else
              ..._conversations.map((c) => Card(
                    child: ListTile(
                      title: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${_sourceLabel(c.source)} · ${c.turnCount} 轮'),
                      trailing: Text(
                        c.updatedAt != null
                            ? '${c.updatedAt!.month}/${c.updatedAt!.day}'
                            : '',
                      ),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}
