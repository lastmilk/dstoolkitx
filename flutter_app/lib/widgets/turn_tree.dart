import 'package:flutter/material.dart';

import '../data/models/models.dart';

/// Turn 版本切换器：一个 Turn 有多个 Version（重新生成）时，
/// 展示 v1/v2/… 切换胶囊；子追问（SubTurn）按顺序追加渲染。
class TurnTree extends StatelessWidget {
  const TurnTree({
    super.key,
    required this.turn,
    required this.messagesByNodeId,
    required this.turnIndexLabel,
  });

  final Turn turn;
  final Map<String, ChatMessage> messagesByNodeId;
  final String turnIndexLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final userMsg = messagesByNodeId[turn.userNodeId];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── 用户提问（Turn 根节点）──
        if (userMsg != null && userMsg.content.trim().isNotEmpty)
          _Bubble(role: 'USER', message: userMsg),

        // ── 助手回复（多 Version 切换）──
        if (turn.versions.isNotEmpty)
          _VersionSwitcher(
            turn: turn,
            messagesByNodeId: messagesByNodeId,
            accent: theme.colorScheme.primary,
          ),
      ],
    );
  }
}

class _VersionSwitcher extends StatefulWidget {
  const _VersionSwitcher({
    required this.turn,
    required this.messagesByNodeId,
    required this.accent,
  });

  final Turn turn;
  final Map<String, ChatMessage> messagesByNodeId;
  final Color accent;

  @override
  State<_VersionSwitcher> createState() => _VersionSwitcherState();
}

class _VersionSwitcherState extends State<_VersionSwitcher> {
  late int _selected = widget.turn.versions.isNotEmpty
      ? widget.turn.versions.length - 1
      : 0;

  @override
  Widget build(BuildContext context) {
    final versions = widget.turn.versions;
    final version = versions[_selected];
    final assistantMsg = widget.messagesByNodeId[version.assistantNodeId];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 版本切换胶囊
        if (versions.length > 1)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Wrap(
              spacing: 6,
              children: [
                for (var i = 0; i < versions.length; i++)
                  _VersionPill(
                    label: 'v${i + 1}',
                    selected: i == _selected,
                    accent: widget.accent,
                    onTap: () => setState(() => _selected = i),
                  ),
              ],
            ),
          ),

        // 选中 version 的助手回复
        if (assistantMsg != null)
          _Bubble(role: 'ASSISTANT', message: assistantMsg),

        // 子追问链（编辑消息产生的分支）
        for (final sub in version.subTurns)
          _SubTurnSequence(
            sub: sub,
            messagesByNodeId: widget.messagesByNodeId,
          ),
      ],
    );
  }
}

class _SubTurnSequence extends StatelessWidget {
  const _SubTurnSequence({
    required this.sub,
    required this.messagesByNodeId,
  });

  final SubTurn sub;
  final Map<String, ChatMessage> messagesByNodeId;

  @override
  Widget build(BuildContext context) {
    final userMsg = messagesByNodeId[sub.userNodeId];
    final assistantMsg = sub.assistantNodeId == null
        ? null
        : messagesByNodeId[sub.assistantNodeId];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (userMsg != null) _Bubble(role: 'USER', message: userMsg),
        if (assistantMsg != null)
          _Bubble(role: 'ASSISTANT', message: assistantMsg),
      ],
    );
  }
}

class _VersionPill extends StatelessWidget {
  const _VersionPill({
    required this.label,
    required this.selected,
    required this.accent,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? accent : accent.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? Colors.white : accent,
          ),
        ),
      ),
    );
  }
}

/// 内部使用的气泡占位 —— 实际渲染交给上层注入的 ChatBubble
typedef BubbleBuilder = Widget Function(
    String role, ChatMessage message);

class _Bubble extends StatelessWidget {
  const _Bubble({required this.role, required this.message});

  final String role;
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    // 由外层 InheritedWidget 提供的 builder 决定真正的气泡样式
    final builder = TurnTreeBubbleProvider.of(context);
    return builder != null
        ? builder(role, message)
        : _PlainFallback(role: role, message: message);
  }
}

class TurnTreeBubbleProvider extends InheritedWidget {
  const TurnTreeBubbleProvider({
    super.key,
    required super.child,
    this.builder,
  });

  final BubbleBuilder? builder;

  static BubbleBuilder? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<TurnTreeBubbleProvider>()?.builder;

  @override
  bool updateShouldNotify(TurnTreeBubbleProvider oldWidget) =>
      builder != oldWidget.builder;
}

class _PlainFallback extends StatelessWidget {
  const _PlainFallback({required this.role, required this.message});

  final String role;
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(10),
      child: Text(
        message.content,
        style: theme.textTheme.bodyMedium,
      ),
    );
  }
}
