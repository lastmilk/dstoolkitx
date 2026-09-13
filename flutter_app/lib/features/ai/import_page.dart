import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/v1_api.dart';
import '../../data/models/models.dart';
import '../../features/auth/auth_controller.dart';

/// 导入页：分享链接增量导入 + 本地文件上传 + 已导入对话列表
class ImportPage extends ConsumerStatefulWidget {
  const ImportPage({super.key});

  @override
  ConsumerState<ImportPage> createState() => _ImportPageState();
}

class _ImportPageState extends ConsumerState<ImportPage> {
  final _urlController = TextEditingController();
  final _nameController = TextEditingController();
  final _conversations = <UnifiedConversation>[];
  var _loading = false;
  var _importing = false;
  var _uploading = false;
  double? _uploadProgress;
  String? _pickedPath;
  String? _pickedName;
  int? _pickedSize;
  V1Api get _api => ref.read(v1ApiProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _urlController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
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
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
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

  // ─────────── 本地文件导入 ───────────

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['zip'],
    );
    final file = result?.files.single;
    if (file == null || file.path == null) return;
    setState(() {
      _pickedPath = file.path;
      _pickedName = file.name;
      _pickedSize = file.size;
    });
    // 容器名默认取文件名（去扩展名）
    if (_nameController.text.trim().isEmpty) {
      _nameController.text = file.name.replaceFirst(
        RegExp(r'\.zip$', caseSensitive: false),
        '',
      );
    }
  }

  Future<void> _upload() async {
    final path = _pickedPath;
    if (path == null) {
      _toast('请先选择 DeepSeek 导出的 zip 文件');
      return;
    }
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      _toast('请填写容器名称');
      return;
    }
    setState(() {
      _uploading = true;
      _uploadProgress = 0;
    });
    try {
      final res = await _api.uploadConfigZip(
        filePath: path,
        name: name,
        onSendProgress: (sent, total) {
          if (total > 0 && mounted) {
            setState(() => _uploadProgress = sent / total);
          }
        },
      );
      final count = res['conversationCount'] as int? ?? 0;
      if (res['persisted'] == true) {
        _toast('导入成功，共 $count 段对话\n回到首页下拉刷新即可查看');
      } else {
        _toast('解析成功 $count 段，但账号未开启云端同步，未入库');
      }
    } on DioException catch (e) {
      final data = e.response?.data;
      final msg = data is Map && data['error'] != null
          ? data['error'].toString()
          : '导入失败，请检查网络';
      _toast(msg);
    } catch (e) {
      _toast('导入失败：$e');
    } finally {
      if (mounted) {
        setState(() {
          _uploading = false;
          _uploadProgress = null;
        });
      }
    }
  }

  String _fmtSize(int bytes) {
    if (bytes >= 1024 * 1024) {
      return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(0)} KB';
    }
    return '$bytes B';
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
            // 本地文件导入（DeepSeek 导出包）
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '本地文件导入',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      '选择 DeepSeek 官方导出的数据包 zip（含 user.json / conversations.json）',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _nameController,
                      decoration: const InputDecoration(
                        labelText: '容器名称',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        OutlinedButton.icon(
                          onPressed: _uploading ? null : _pickFile,
                          icon: const Icon(Icons.folder_open),
                          label: const Text('选择 zip'),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _pickedName == null
                                ? '未选择文件'
                                : '$_pickedName（${_fmtSize(_pickedSize ?? 0)}）',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: _pickedName == null ? Colors.grey : null,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (_uploading && _uploadProgress != null) ...[
                      const SizedBox(height: 12),
                      LinearProgressIndicator(value: _uploadProgress),
                    ],
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed:
                          (_uploading || _pickedPath == null) ? null : _upload,
                      icon: _uploading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.upload_file),
                      label: Text(_uploading ? '上传中...' : '上传并导入'),
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
                      title: Text(c.title,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle:
                          Text('${_sourceLabel(c.source)} · ${c.turnCount} 轮'),
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
