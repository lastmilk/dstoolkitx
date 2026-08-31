import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../auth/auth_controller.dart';
import '../../widgets/guest_gate.dart';

/// 统计页：/api/v1/stats 计数卡片 + 柱状简图
class StatsPage extends ConsumerStatefulWidget {
  const StatsPage({super.key});

  @override
  ConsumerState<StatsPage> createState() => _StatsPageState();
}

class _StatsPageState extends ConsumerState<StatsPage> {
  StatsSummary? _stats;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final stats = await ref.read(v1ApiProvider).stats();
      setState(() => _stats = stats);
    } catch (_) {
      setState(() => _error = '加载失败，请下拉重试');
    }
  }

  @override
  Widget build(BuildContext context) {
    final neu = NeuColors.of(context);
    return GuestGate(
      title: '登录后查看数据统计',
      subtitle: '配置数、对话数、消息量一目了然',
      child: Scaffold(
        appBar: AppBar(title: const Text('统计')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ),
              if (_stats != null) ...[
                Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        icon: Icons.hub_outlined,
                        label: '配置',
                        value: _stats!.configs,
                        surface: neu.surface,
                        shadowDark: neu.shadowDark,
                        shadowLight: neu.shadowLight,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        icon: Icons.forum_outlined,
                        label: '对话',
                        value: _stats!.conversations,
                        surface: neu.surface,
                        shadowDark: neu.shadowDark,
                        shadowLight: neu.shadowLight,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        icon: Icons.chat_bubble_outline_rounded,
                        label: '消息',
                        value: _stats!.messages,
                        surface: neu.surface,
                        shadowDark: neu.shadowDark,
                        shadowLight: neu.shadowLight,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        icon: Icons.key_outlined,
                        label: 'API 令牌',
                        value: _stats!.apiTokens,
                        surface: neu.surface,
                        shadowDark: neu.shadowDark,
                        shadowLight: neu.shadowLight,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text('数据概览', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 12),
                _BarChartCard(
                  stats: _stats!,
                  surface: neu.surface,
                  shadowDark: neu.shadowDark,
                  shadowLight: neu.shadowLight,
                ),
              ] else
                const Padding(
                  padding: EdgeInsets.only(top: 120),
                  child: Center(child: CircularProgressIndicator()),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.surface,
    required this.shadowDark,
    required this.shadowLight,
  });

  final IconData icon;
  final String label;
  final int value;
  final Color surface;
  final Color shadowDark;
  final Color shadowLight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: NeuBoxDecoration(
        color: surface,
        shadowDark: shadowDark,
        shadowLight: shadowLight,
      ),
      child: Column(
        children: [
          Icon(icon, size: 26, color: theme.colorScheme.primary),
          const SizedBox(height: 8),
          Text(
            _format(value),
            style: theme.textTheme.headlineSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(label, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }

  String _format(int n) {
    if (n >= 10000) return '${(n / 10000).toStringAsFixed(1)}w';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return '$n';
  }
}

class _BarChartCard extends StatelessWidget {
  const _BarChartCard({
    required this.stats,
    required this.surface,
    required this.shadowDark,
    required this.shadowLight,
  });

  final StatsSummary stats;
  final Color surface;
  final Color shadowDark;
  final Color shadowLight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bars = [
      (stats.configs, '配置'),
      (stats.conversations, '对话'),
      (stats.messages, '消息'),
    ];
    final maxV = bars.map((b) => b.$1).fold(1, (a, b) => a > b ? a : b);

    return Container(
      height: 220,
      padding: const EdgeInsets.fromLTRB(12, 20, 12, 8),
      decoration: NeuBoxDecoration(
        color: surface,
        shadowDark: shadowDark,
        shadowLight: shadowLight,
      ),
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: maxV * 1.2,
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipItem: (group, gIdx, rod, rIdx) => BarTooltipItem(
                rod.toY.round().toString(),
                TextStyle(
                  color: theme.colorScheme.onPrimary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          titlesData: FlTitlesData(
            leftTitles: const AxisTitles(),
            rightTitles: const AxisTitles(),
            topTitles: const AxisTitles(),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (value, meta) => Text(
                  bars[value.toInt()].$2,
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ),
          ),
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          barGroups: [
            for (var i = 0; i < bars.length; i++)
              BarChartGroupData(
                x: i,
                barRods: [
                  BarChartRodData(
                    toY: bars[i].$1.toDouble(),
                    width: 28,
                    borderRadius: BorderRadius.circular(6),
                    color: theme.colorScheme.primary,
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
