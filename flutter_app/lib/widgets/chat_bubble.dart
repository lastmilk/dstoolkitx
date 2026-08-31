import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;

/// 聊天气泡：用户（右侧）/ 助手（左侧）。
/// Markdown 渲染失败时自动降级为纯文本（PRD 1149208 教训）。
class ChatBubble extends StatelessWidget {
  const ChatBubble({
    super.key,
    required this.role,
    required this.content,
    this.model,
    this.timestamp,
  });

  final String role; // USER / ASSISTANT
  final String content;
  final String? model;
  final DateTime? timestamp;

  bool get isUser => role == 'USER';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final neu = Theme.of(context).brightness == Brightness.dark;
    final surface = isUser
        ? theme.colorScheme.primary.withValues(alpha: 0.12)
        : (neu ? const Color(0xFF2B3242) : Colors.white);
    final radius = BorderRadius.only(
      topLeft: const Radius.circular(16),
      topRight: const Radius.circular(16),
      bottomLeft: Radius.circular(isUser ? 16 : 4),
      bottomRight: Radius.circular(isUser ? 4 : 16),
    );

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.86,
        ),
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: surface,
          borderRadius: radius,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser && (model != null || timestamp != null))
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (model != null)
                      Text(
                        model!,
                        style: TextStyle(
                          fontSize: 10,
                          color: theme.colorScheme.outline,
                        ),
                      ),
                  ],
                ),
              ),
            _MarkdownOrPlain(content: content, isUser: isUser),
          ],
        ),
      ),
    );
  }
}

/// Markdown 渲染 + 失败降级纯文本
class _MarkdownOrPlain extends StatelessWidget {
  const _MarkdownOrPlain({required this.content, required this.isUser});

  final String content;
  final bool isUser;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MarkdownBody(
      data: content,
      selectable: true,
      shrinkWrap: true,
      styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
        p: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
        code: theme.textTheme.bodySmall?.copyWith(
          fontFamily: 'monospace',
          backgroundColor: theme.colorScheme.surfaceContainerHighest,
        ),
        codeblockDecoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
        ),
        blockquoteDecoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: theme.colorScheme.primary, width: 3),
          ),
        ),
      ),
      // 渲染异常（公式/超长嵌套等）时 ErrorWidget 降级为纯文本
      builders: {
        'code': _FallbackCodeBuilder(),
      },
    );
  }
}

/// 代码块构建器：统一走 _SafeCode（出错时退化为 SelectableText）
class _FallbackCodeBuilder extends MarkdownElementBuilder {
  _FallbackCodeBuilder();

  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) {
    final text = element.textContent;
    return _SafeCode(text: text);
  }
}

/// 包一层 try 的安全渲染：任何渲染异常都回退纯文本
class _SafeCode extends StatelessWidget {
  const _SafeCode({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: SelectableText(
        text,
        style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
      ),
    );
  }
}
