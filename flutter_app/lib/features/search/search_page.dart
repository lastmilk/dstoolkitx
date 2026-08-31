import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../auth/auth_controller.dart';
import '../../widgets/guest_gate.dart';

/// 全文搜索：调 /api/v1/search，点击结果跳转对话详情
class SearchPage extends ConsumerStatefulWidget {
  const SearchPage({super.key});

  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  final _controller = TextEditingController();
  List<SearchResult>? _results;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final q = _controller.text.trim();
    if (q.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await ref.read(v1ApiProvider).search(keyword: q);
      setState(() {
        _results = results;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = '搜索失败，请检查网络';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final neu = NeuColors.of(context);
    return GuestGate(
      title: '登录后使用全文搜索',
      subtitle: '搜索你的对话标题与消息内容',
      child: Scaffold(
        appBar: AppBar(title: const Text('搜索')),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                controller: _controller,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                  hintText: '搜索对话标题与消息内容…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _loading
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : IconButton(
                          icon: const Icon(Icons.arrow_forward_rounded),
                          onPressed: _search,
                        ),
                  filled: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.all(8),
                child: Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            Expanded(child: _buildResults(neu)),
          ],
        ),
      ),
    );
  }

  Widget _buildResults(NeuColors neu) {
    final results = _results;
    if (results == null) {
      return const Center(
        child: Text('输入关键词开始搜索', style: TextStyle(color: Colors.grey)),
      );
    }
    if (results.isEmpty) {
      return const Center(
        child: Text('没有找到相关内容', style: TextStyle(color: Colors.grey)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: results.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final r = results[index];
        return _ResultCard(
          result: r,
          surface: neu.surface,
          shadowDark: neu.shadowDark,
          shadowLight: neu.shadowLight,
          onTap: () => context.push('/conversation/${r.configId}/${r.convId}'),
        );
      },
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({
    required this.result,
    required this.onTap,
    required this.surface,
    required this.shadowDark,
    required this.shadowLight,
  });

  final SearchResult result;
  final VoidCallback onTap;
  final Color surface;
  final Color shadowDark;
  final Color shadowLight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final roleLabel = switch (result.role) {
      'TITLE' => '标题',
      'USER' => '我',
      _ => 'AI',
    };
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: NeuBoxDecoration(
          color: surface,
          shadowDark: shadowDark,
          shadowLight: shadowLight,
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    result.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(roleLabel,
                      style: TextStyle(
                          fontSize: 11, color: theme.colorScheme.primary)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              result.content,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(height: 1.4),
            ),
          ],
        ),
      ),
    );
  }
}
