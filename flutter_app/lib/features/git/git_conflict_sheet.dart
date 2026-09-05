import 'package:flutter/material.dart';

import '../../data/git/git_service.dart';

/// Git 冲突处理对话框：逐文件三选一（保留本地 / 保留远端 / 智能合并）。
/// 返回 path → 策略；null = 用户取消本次同步。
Future<Map<String, ConflictResolution>?> showGitConflictSheet(
  BuildContext context, {
  required String containerName,
  required List<GitConflict> conflicts,
}) {
  final resolutions = <String, ConflictResolution>{
    for (final c in conflicts) c.path: 'local',
  };
  return showModalBottomSheet<Map<String, ConflictResolution>>(
    context: context,
    isScrollControlled: true,
    isDismissible: false,
    enableDrag: false,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '对话冲突 · $containerName',
              style: Theme.of(ctx)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              '本地与远端对 ${conflicts.length} 个对话都有修改，Git 无法自动合并。请逐个选择保留策略：',
              style: Theme.of(ctx).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('批量：', style: Theme.of(ctx).textTheme.bodySmall),
                const SizedBox(width: 8),
                for (final (label, v) in const [
                  ('本地', 'local'),
                  ('远端', 'remote'),
                  ('智能合并', 'smart'),
                ]) ...[
                  ActionChip(
                    label: Text(label),
                    onPressed: () => setState(() {
                      for (final c in conflicts) {
                        resolutions[c.path] = v;
                      }
                    }),
                  ),
                  const SizedBox(width: 6),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: conflicts.length,
                itemBuilder: (ctx, i) {
                  final c = conflicts[i];
                  return Card(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    child: Padding(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            c.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '本地 ${c.localSummary.turns} 轮 · ${_fmtTime(c.localSummary.updatedAt)}　'
                            '远端 ${c.remoteSummary.turns} 轮 · ${_fmtTime(c.remoteSummary.updatedAt)}',
                            style: Theme.of(ctx).textTheme.bodySmall,
                          ),
                          const SizedBox(height: 6),
                          SegmentedButton<String>(
                            segments: const [
                              ButtonSegment(value: 'local', label: Text('本地')),
                              ButtonSegment(value: 'remote', label: Text('远端')),
                              ButtonSegment(value: 'smart', label: Text('智能')),
                            ],
                            selected: {resolutions[c.path] ?? 'local'},
                            onSelectionChanged: (s) => setState(
                                () => resolutions[c.path] = s.first),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, null),
                  child: const Text('取消本次同步'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, resolutions),
                  child: const Text('应用并继续推送'),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

String _fmtTime(String iso) {
  final t = DateTime.tryParse(iso)?.toLocal();
  if (t == null) return '-';
  return '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')} '
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}
