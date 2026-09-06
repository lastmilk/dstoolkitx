import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/v1_api.dart';
import '../../data/models/models.dart';
import '../../features/auth/auth_controller.dart';

/// AI 续聊页：DeepSeek 内置模型，每小时限流
class ContinueChatPage extends ConsumerStatefulWidget {
  const ContinueChatPage({super.key});

  @override
  ConsumerState<ContinueChatPage> createState() => _ContinueChatPageState();
}

class _ContinueChatPageState extends ConsumerState<ContinueChatPage> {
  final _conversations = <UnifiedConversation>[];
  final _messages = <UnifiedMessage>[];
  final _inputController = TextEditingController();
  var _loadingList = false;
  var _loadingConv = false;
  var _sending = false;
  int? _activeId;
  String _model = 'deepseek-chat';

  V1Api get _api => ref.read(v1ApiProvider);

  @override
  void initState() {
    super.initState();
    _loadList();
  }

  Future<void> _loadList() async {
    setState(() => _loadingList = true);
    try {
      final list = await _api.continueChatConversations();
      setState(() {
        _conversations
          ..clear()
          ..addAll(list);
      });
    } catch (_) {} finally {
      if (mounted) setState(() => _loadingList = false);
    }
  }

  Future<void> _createAndOpen() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      final conv = await _api.createContinueChat(
        title: text.length > 20 ? '${text.substring(0, 20)}...' : text,
        firstMessage: text,
        model: _model,
      );
      _inputController.clear();
      setState(() {
        _conversations.insert(0, conv);
        _activeId = conv.id;
        _messages.clear();
      });
      await _loadDetail(conv.id);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('失败：$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _loadDetail(int id) async {
    setState(() {
      _activeId = id;
      _loadingConv = true;
    });
    try {
      final msgs = await _api.continueChatDetail(id);
      setState(() {
        _messages
          ..clear()
          ..addAll(msgs);
      });
    } catch (_) {} finally {
      if (mounted) setState(() => _loadingConv = false);
    }
  }

  Future<void> _sendMessage() async {
    final text = _inputController.text.trim();
    if (text.isEmpty || _sending || _activeId == null) return;
    setState(() => _sending = true);
    _inputController.clear();

    // 乐观追加用户消息 + 占位 AI 消息
    final userMsg = UnifiedMessage(
      id: DateTime.now().millisecondsSinceEpoch,
      conversationId: _activeId!,
      role: 'USER',
      content: text,
      insertedAt: DateTime.now(),
    );
    final aiMsg = UnifiedMessage(
      id: DateTime.now().millisecondsSinceEpoch + 1,
      conversationId: _activeId!,
      role: 'ASSISTANT',
      content: '',
      insertedAt: DateTime.now(),
    );
    setState(() {
      _messages.add(userMsg);
      _messages.add(aiMsg);
    });

    var full = '';
    try {
      full = await _api.sendContinueChatMessage(
        conversationId: _activeId!,
        content: text,
        model: _model,
        onDelta: (d) {
          if (mounted) {
            setState(() {
              final idx = _messages.length - 1;
              _messages[idx] = UnifiedMessage(
                id: _messages[idx].id,
                conversationId: _messages[idx].conversationId,
                role: _messages[idx].role,
                content: _messages[idx].content + d,
                insertedAt: _messages[idx].insertedAt,
              );
            });
          }
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          final idx = _messages.length - 1;
          _messages[idx] = UnifiedMessage(
            id: _messages[idx].id,
            conversationId: _messages[idx].conversationId,
            role: _messages[idx].role,
            content: '❌ $e',
            insertedAt: _messages[idx].insertedAt,
          );
        });
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI 续聊'),
        actions: [
          DropdownButton<String>(
            value: _model,
            underline: const SizedBox(),
            items: const [
              DropdownMenuItem(value: 'deepseek-chat', child: Text('Chat')),
              DropdownMenuItem(value: 'deepseek-reasoner', child: Text('Reasoner')),
            ],
            onChanged: (v) => setState(() => _model = v ?? 'deepseek-chat'),
          ),
        ],
      ),
      body: Row(
        children: [
          // 对话列表（窄屏时隐藏）
          if (MediaQuery.of(context).size.width > 600)
            SizedBox(
              width: 240,
              child: _buildList(),
            ),
          // 对话区
          Expanded(child: _buildChat()),
        ],
      ),
    );
  }

  Widget _buildList() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(8),
          child: FilledButton.icon(
            onPressed: _createAndOpen,
            icon: const Icon(Icons.add),
            label: const Text('新对话'),
          ),
        ),
        Expanded(
          child: _loadingList
              ? const Center(child: CircularProgressIndicator())
              : ListView.builder(
                  itemCount: _conversations.length,
                  itemBuilder: (_, i) {
                    final c = _conversations[i];
                    return ListTile(
                      title: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${c.turnCount} 轮'),
                      selected: c.id == _activeId,
                      onTap: () => _loadDetail(c.id),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildChat() {
    return Column(
      children: [
        Expanded(
          child: _loadingConv
              ? const Center(child: CircularProgressIndicator())
              : _messages.isEmpty
                  ? const Center(child: Text('选择或新建对话开始续聊'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: _messages.length,
                      itemBuilder: (_, i) {
                        final m = _messages[i];
                        final isUser = m.role == 'USER';
                        return Align(
                          alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.symmetric(vertical: 4),
                            padding: const EdgeInsets.all(10),
                            constraints: BoxConstraints(
                              maxWidth: MediaQuery.of(context).size.width * 0.75,
                            ),
                            decoration: BoxDecoration(
                              color: isUser
                                  ? Theme.of(context).colorScheme.primary
                                  : Theme.of(context).colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              m.content.isEmpty ? '思考中...' : m.content,
                              style: TextStyle(
                                color: isUser ? Colors.white : null,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
        ),
        // 输入区
        Padding(
          padding: const EdgeInsets.all(8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _inputController,
                  maxLines: 3,
                  minLines: 1,
                  decoration: const InputDecoration(
                    hintText: '输入消息...',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _sending ? null : _sendMessage,
                icon: _sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
