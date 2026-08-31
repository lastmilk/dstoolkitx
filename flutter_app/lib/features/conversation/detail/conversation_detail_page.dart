import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/local/app_cache.dart';
import '../../../data/models/models.dart';
import '../../../widgets/chat_bubble.dart';
import '../../../widgets/turn_tree.dart';
import '../../auth/auth_controller.dart';

/// 对话详情：Turn/Version/SubTurn 树渲染 + Markdown 气泡 + 离线缓存
class ConversationDetailPage extends ConsumerStatefulWidget {
  const ConversationDetailPage({
    super.key,
    required this.configId,
    required this.convId,
  });

  final int configId;
  final String convId;

  @override
  ConsumerState<ConversationDetailPage> createState() =>
      _ConversationDetailPageState();
}

class _ConversationDetailPageState
    extends ConsumerState<ConversationDetailPage> {
  ConversationDetail? _detail;
  bool _loading = true;
  bool _offline = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await ref.read(v1ApiProvider).conversationDetail(
            configId: widget.configId,
            convId: widget.convId,
          );
      // 缓存供离线回看
      await AppCache.put(
        AppCache.convDetailKey(widget.configId, widget.convId),
        _toJson(detail),
      );
      setState(() {
        _detail = detail;
        _loading = false;
        _offline = false;
      });
    } catch (_) {
      final cached = await AppCache.getJson(
        AppCache.convDetailKey(widget.configId, widget.convId),
      );
      if (cached != null) {
        setState(() {
          _detail = ConversationDetail.fromJson(cached);
          _loading = false;
          _offline = true;
        });
      } else {
        setState(() {
          _loading = false;
          _error = '加载失败，请检查网络后重试';
        });
      }
    }
  }

  Map<String, dynamic> _toJson(ConversationDetail d) => {
        'id': d.id,
        'deepseekConvId': d.deepseekConvId,
        'title': d.title,
        'turnCount': d.turnCount,
        'updatedAt': d.updatedAt?.toIso8601String(),
        'messages': [
          for (final m in d.messages)
            {
              'id': m.id,
              'nodeId': m.nodeId,
              'parentId': m.parentId,
              'role': m.role,
              'model': m.model,
              'content': m.content,
              'insertedAt': m.insertedAt?.toIso8601String(),
              'turnIndex': m.turnIndex,
              'versionIndex': m.versionIndex,
              'subTurnIndex': m.subTurnIndex,
            }
        ],
        'turns': [
          for (final t in d.turns)
            {
              'turnIndex': t.turnIndex,
              'userNodeId': t.userNodeId,
              'versions': [
                for (final v in t.versions)
                  {
                    'versionIndex': v.versionIndex,
                    'assistantNodeId': v.assistantNodeId,
                    'subTurns': [
                      for (final s in v.subTurns)
                        {
                          'subTurnIndex': s.subTurnIndex,
                          'userNodeId': s.userNodeId,
                          'assistantNodeId': s.assistantNodeId,
                        }
                    ],
                  }
              ],
            }
        ],
      };

  @override
  Widget build(BuildContext context) {
    final neu = NeuColors.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _detail?.title ?? '对话详情',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _load,
          ),
        ],
      ),
      body: _buildBody(neu),
    );
  }

  Widget _buildBody(NeuColors neu) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            const SizedBox(height: 12),
            FilledButton(onPressed: _load, child: const Text('重试')),
          ],
        ),
      );
    }
    final detail = _detail;
    if (detail == null) return const SizedBox.shrink();

    if (detail.turns.isEmpty && detail.messages.isEmpty) {
      return const Center(child: Text('这个对话没有消息'));
    }

    // nodeId → message 映射
    final byNodeId = <String, ChatMessage>{
      for (final m in detail.messages) m.nodeId: m,
    };

    return Column(
      children: [
        if (_offline)
          Container(
            width: double.infinity,
            color: Colors.orange.withValues(alpha: 0.15),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: const Text('离线模式：展示本地缓存内容',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.orange)),
          ),
        Expanded(
          child: TurnTreeBubbleProvider(
            builder: (role, message) => ChatBubble(
              role: role,
              content: message.content,
              model: message.model,
              timestamp: message.insertedAt,
            ),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              itemCount: detail.turns.length,
              itemBuilder: (context, index) {
                final turn = detail.turns[index];
                return TurnTree(
                  turn: turn,
                  messagesByNodeId: byNodeId,
                  turnIndexLabel: '${index + 1}',
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}
