import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../../data/models/models.dart';
import '../../../widgets/guest_gate.dart';
import 'conversation_list_controller.dart';

/// 对话列表：config 切换 + 分页加载 + 下拉刷新 + 离线缓存
class ConversationListPage extends ConsumerStatefulWidget {
  const ConversationListPage({super.key});

  @override
  ConsumerState<ConversationListPage> createState() =>
      _ConversationListPageState();
}

class _ConversationListPageState extends ConsumerState<ConversationListPage> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        ref.read(conversationListProvider.notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(conversationListProvider);
    final neu = NeuColors.of(context);

    return GuestGate(
      title: '登录后查看你的对话',
      subtitle: '同步并浏览你的 DeepSeek 对话记录\n支持搜索、统计与离线阅读',
      child: Scaffold(
        appBar: AppBar(
          title: const Text('我的对话'),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              onPressed: () =>
                  ref.read(conversationListProvider.notifier).refresh(),
            ),
          ],
        ),
        body: Column(
          children: [
            if (state.offline) _OfflineBanner(text: '离线模式：展示本地缓存内容'),
            if (state.configs.length > 1) _ConfigChips(state: state),
            if (state.error != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(state.error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            Expanded(child: _buildBody(state, neu)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(ConversationListState state, NeuColors neu) {
    if (state.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.configs.isEmpty) {
      return _EmptyHint(
        icon: Icons.cloud_off_outlined,
        text: '暂无数据\n请先在 Web 端导入 DeepSeek 对话',
      );
    }
    if (state.conversations.isEmpty) {
      return _EmptyHint(
        icon: Icons.forum_outlined,
        text: state.error != null ? '加载失败，下拉重试' : '这个配置下还没有对话',
      );
    }
    return RefreshIndicator(
      onRefresh: () => ref.read(conversationListProvider.notifier).refresh(),
      child: ListView.separated(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: state.conversations.length + (state.hasMore ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index >= state.conversations.length) {
            return const Padding(
              padding: EdgeInsets.all(16),
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            );
          }
          final conv = state.conversations[index];
          return _ConvCard(
            key: ValueKey('${conv.deepseekConvId}_${conv.updatedAt}'),
            conv: conv,
            surface: neu.surface,
            shadowDark: neu.shadowDark,
            shadowLight: neu.shadowLight,
            onTap: () => context.push(
              '/conversation/${state.selectedConfigId}/${conv.deepseekConvId}',
            ),
          );
        },
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Colors.orange.withValues(alpha: 0.15),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Text(text,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: Colors.orange)),
    );
  }
}

class _ConfigChips extends ConsumerWidget {
  const _ConfigChips({required this.state});
  final ConversationListState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: state.configs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final config = state.configs[index];
          final selected = config.id == state.selectedConfigId;
          return ChoiceChip(
            label: Text(config.name),
            selected: selected,
            onSelected: (_) => ref
                .read(conversationListProvider.notifier)
                .selectConfig(config.id),
          );
        },
      ),
    );
  }
}

class _ConvCard extends StatelessWidget {
  const _ConvCard({
    super.key,
    required this.conv,
    required this.onTap,
    required this.surface,
    required this.shadowDark,
    required this.shadowLight,
  });

  final ConversationLite conv;
  final VoidCallback onTap;
  final Color surface;
  final Color shadowDark;
  final Color shadowLight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = DateFormat('yyyy-MM-dd HH:mm');
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: NeuBoxDecoration(
          color: surface,
          shadowDark: shadowDark,
          shadowLight: shadowLight,
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              conv.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(Icons.schedule_rounded,
                    size: 14, color: theme.colorScheme.outline),
                const SizedBox(width: 4),
                Text(
                  conv.updatedAt != null
                      ? fmt.format(conv.updatedAt!.toLocal())
                      : '-',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.outline),
                ),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${conv.turnCount} 轮',
                    style: TextStyle(
                      fontSize: 11,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 56, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.outline),
          ),
        ],
      ),
    );
  }
}
