import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/v1_api.dart';
import '../../data/models/models.dart';
import '../../features/auth/auth_controller.dart';

/// 记忆试卷页：AI 基于知识库生成试卷与参考答案
class TestPaperPage extends ConsumerStatefulWidget {
  const TestPaperPage({super.key});

  @override
  ConsumerState<TestPaperPage> createState() => _TestPaperPageState();
}

class _TestPaperPageState extends ConsumerState<TestPaperPage> {
  final _papers = <TestPaperLite>[];
  final _requirementController = TextEditingController();
  var _loading = false;
  var _generating = false;
  int _questionCount = 10;
  String _difficulty = 'medium';

  V1Api get _api => ref.read(v1ApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _api.testPapers();
      setState(() {
        _papers
          ..clear()
          ..addAll(list);
      });
    } catch (_) {} finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _generate() async {
    final req = _requirementController.text.trim();
    if (req.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请描述你想测试的知识点')),
      );
      return;
    }
    setState(() => _generating = true);
    try {
      final res = await _api.generateTestPaper(
        requirement: req,
        questionCount: _questionCount,
        difficulty: _difficulty,
      );
      final jobId = res['jobId'] as String?;
      _requirementController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('试卷生成中，请稍候...')),
        );
      }
      // 轮询
      if (jobId != null) {
        for (var i = 0; i < 60; i++) {
          await Future.delayed(const Duration(seconds: 2));
          try {
            final job = await _api.testPaperJob(jobId);
            if (job['status'] == 'done') {
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('试卷生成完成！')),
                );
              }
              _load();
              return;
            }
            if (job['status'] == 'failed') {
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('生成失败：${job['error'] ?? '未知错误'}')),
                );
              }
              _load();
              return;
            }
          } catch (_) {
            return;
          }
        }
      }
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('生成失败：$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  Future<void> _openDetail(int id) async {
    try {
      final paper = await _api.testPaperDetail(id);
      if (mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => TestPaperDetailPage(paper: paper),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('加载失败：$e')),
        );
      }
    }
  }

  String _diffLabel(String d) {
    switch (d) {
      case 'easy':
        return '简单';
      case 'hard':
        return '困难';
      default:
        return '中等';
    }
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'READY':
        return Colors.green;
      case 'FAILED':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('记忆试卷')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 生成卡片
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '生成记忆试卷',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'AI 将基于你的知识库生成试卷与参考答案',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _requirementController,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: '描述需求',
                        hintText: '例如：测试 React Hooks 的理解',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            value: _difficulty,
                            decoration: const InputDecoration(labelText: '难度'),
                            items: const [
                              DropdownMenuItem(value: 'easy', child: Text('简单')),
                              DropdownMenuItem(value: 'medium', child: Text('中等')),
                              DropdownMenuItem(value: 'hard', child: Text('困难')),
                            ],
                            onChanged: (v) => setState(() => _difficulty = v ?? 'medium'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: DropdownButtonFormField<int>(
                            value: _questionCount,
                            decoration: const InputDecoration(labelText: '题量'),
                            items: const [
                              DropdownMenuItem(value: 5, child: Text('5 题')),
                              DropdownMenuItem(value: 10, child: Text('10 题')),
                              DropdownMenuItem(value: 20, child: Text('20 题')),
                            ],
                            onChanged: (v) => setState(() => _questionCount = v ?? 10),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _generating ? null : _generate,
                      icon: _generating
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.auto_awesome),
                      label: Text(_generating ? '生成中...' : '生成试卷'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            // 试卷列表
            const Text(
              '我的试卷',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_papers.isEmpty)
              const Padding(
                padding: EdgeInsets.all(32),
                child: Center(
                  child: Text(
                    '暂无试卷\n描述需求后点击上方按钮生成',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              )
            else
              ..._papers.map((p) => Card(
                    child: ListTile(
                      title: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        '${_diffLabel(p.difficulty)} · ${p.questionCount}题 · ${p.totalScore}分',
                      ),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: _statusColor(p.status).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          p.status,
                          style: TextStyle(color: _statusColor(p.status), fontSize: 12),
                        ),
                      ),
                      onTap: p.status == 'READY' ? () => _openDetail(p.id) : null,
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

/// 试卷详情页：答题 + 查看答案
class TestPaperDetailPage extends StatefulWidget {
  const TestPaperDetailPage({super.key, required this.paper});

  final TestPaperDetail paper;

  @override
  State<TestPaperDetailPage> createState() => _TestPaperDetailPageState();
}

class _TestPaperDetailPageState extends State<TestPaperDetailPage> {
  final _answers = <int, dynamic>{};
  var _showAnswers = false;

  String _typeLabel(String t) {
    switch (t) {
      case 'SINGLE_CHOICE':
        return '单选题';
      case 'MULTIPLE_CHOICE':
        return '多选题';
      case 'TRUE_FALSE':
        return '判断题';
      case 'FILL_BLANK':
        return '填空题';
      default:
        return '简答题';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.paper.title)),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: widget.paper.questions.length,
              itemBuilder: (_, i) {
                final q = widget.paper.questions[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text('${i + 1}.', style: const TextStyle(fontWeight: FontWeight.bold)),
                            const SizedBox(width: 6),
                            Chip(label: Text(_typeLabel(q.type)), visualDensity: VisualDensity.compact),
                            const Spacer(),
                            Text('${q.score}分', style: const TextStyle(color: Colors.grey)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(q.content, style: const TextStyle(fontSize: 15)),
                        const SizedBox(height: 8),
                        // 选项
                        if (q.options != null && q.type != 'TRUE_FALSE')
                          ...q.options!.map((opt) {
                            final o = opt as Map<String, dynamic>;
                            final key = o['key'] as String;
                            final isSelected = q.type == 'MULTIPLE_CHOICE'
                                ? (_answers[q.id] as List?)?.contains(key) ?? false
                                : _answers[q.id] == key;
                            return ListTile(
                              title: Text('$key. ${o['text']}'),
                              leading: q.type == 'MULTIPLE_CHOICE'
                                  ? Checkbox(
                                      value: isSelected,
                                      onChanged: _showAnswers
                                          ? null
                                          : (v) {
                                              setState(() {
                                                final list = (_answers[q.id] as List?) ?? [];
                                                if (v == true) {
                                                  _answers[q.id] = [...list, key];
                                                } else {
                                                  _answers[q.id] = list.where((e) => e != key).toList();
                                                }
                                              });
                                            },
                                    )
                                  : Radio<String>(
                                      value: key,
                                      groupValue: _answers[q.id] as String?,
                                      onChanged: _showAnswers ? null : (v) => setState(() => _answers[q.id] = v),
                                    ),
                            );
                          }),
                        // 判断题
                        if (q.type == 'TRUE_FALSE')
                          Row(
                            children: [
                              Radio<bool>(
                                value: true,
                                groupValue: _answers[q.id] as bool?,
                                onChanged: _showAnswers ? null : (v) => setState(() => _answers[q.id] = v),
                              ),
                              const Text('正确'),
                              const SizedBox(width: 16),
                              Radio<bool>(
                                value: false,
                                groupValue: _answers[q.id] as bool?,
                                onChanged: _showAnswers ? null : (v) => setState(() => _answers[q.id] = v),
                              ),
                              const Text('错误'),
                            ],
                          ),
                        // 填空 / 简答
                        if (q.type == 'FILL_BLANK' || q.type == 'SHORT_ANSWER')
                          TextField(
                            maxLines: q.type == 'SHORT_ANSWER' ? 3 : 1,
                            decoration: const InputDecoration(hintText: '请输入答案'),
                            onChanged: (v) => _answers[q.id] = v,
                            enabled: !_showAnswers,
                          ),
                        // 答案与解析
                        if (_showAnswers) ...[
                          const Divider(),
                          Text(
                            '参考答案：${q.answer is List ? (q.answer as List).join(', ') : q.answer}',
                            style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
                          ),
                          if (q.explanation != null) ...[
                            const SizedBox(height: 4),
                            Text('解析：${q.explanation}', style: const TextStyle(color: Colors.grey)),
                          ],
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          // 底部按钮
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => setState(() => _showAnswers = !_showAnswers),
                child: Text(_showAnswers ? '重新答题' : '提交并查看答案'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
