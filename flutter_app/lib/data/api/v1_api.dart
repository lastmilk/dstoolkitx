import 'dart:convert';

import 'package:dio/dio.dart';

import '../models/models.dart';

/// /api/v1/* RESTful API（Bearer dstk_ 鉴权由 Dio 拦截器注入）
class V1Api {
  V1Api(this.dio);

  final Dio dio;

  Future<User> me() async {
    final res = await dio.get('/v1/me');
    return User.fromJson((res.data as Map<String, dynamic>)['user'] as Map<String, dynamic>);
  }

  Future<List<DeepseekConfig>> configs() async {
    final res = await dio.get('/v1/configs');
    final list = (res.data as Map<String, dynamic>)['configs'] as List<dynamic>;
    return list
        .map((e) => DeepseekConfig.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Paged<ConversationLite>> conversations({
    required int configId,
    int page = 1,
    int pageSize = 20,
  }) async {
    final res = await dio.get(
      '/v1/configs/$configId/conversations',
      queryParameters: {'page': page, 'pageSize': pageSize},
    );
    return Paged.fromJson(
      res.data as Map<String, dynamic>,
      ConversationLite.fromJson,
    );
  }

  Future<ConversationDetail> conversationDetail({
    required int configId,
    required String convId,
  }) async {
    final res = await dio.get('/v1/configs/$configId/conversations/$convId');
    return ConversationDetail.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<SearchResult>> search({
    required String keyword,
    int? configId,
    int limit = 50,
  }) async {
    final res = await dio.get(
      '/v1/search',
      queryParameters: {
        'q': keyword,
        if (configId != null) 'configId': configId,
        'limit': limit,
      },
    );
    final list = (res.data as Map<String, dynamic>)['results'] as List<dynamic>;
    return list
        .map((e) => SearchResult.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<StatsSummary> stats() async {
    final res = await dio.get('/v1/stats');
    return StatsSummary.fromJson(res.data as Map<String, dynamic>);
  }

  // ─────────── Git 生态 ───────────

  /// GET /configs/:id/git-info — 仓库地址 + 推送用户名 + 是否已有可用 key
  Future<GitInfo> gitInfo(int configId) async {
    final res = await dio.get('/configs/$configId/git-info');
    return GitInfo.fromJson(res.data as Map<String, dynamic>);
  }

  /// GET /gitkeys — Git 用户名状态 + key 列表
  Future<({String? gitUsername, bool needsGitUsername, List<GitKeyItem> keys})>
      gitKeys() async {
    final res = await dio.get('/gitkeys');
    final data = res.data as Map<String, dynamic>;
    return (
      gitUsername: data['gitUsername'] as String?,
      needsGitUsername: data['needsGitUsername'] as bool? ?? false,
      keys: (data['keys'] as List<dynamic>? ?? [])
          .map((e) => GitKeyItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  /// POST /gitkeys/username — 设置 Git 推送用户名（英文/数字/下划线）
  Future<void> setGitUsername(String gitUsername) async {
    await dio.post('/gitkeys/username', data: {'gitUsername': gitUsername});
  }

  /// POST /gitkeys — 生成 Git APIKey（明文仅此一次返回）
  Future<GitKeyCreated> createGitKey({
    required String name,
    int? containerId,
    bool confirmGlobal = false,
    int? expiresInDays,
  }) async {
    final res = await dio.post('/gitkeys', data: {
      'name': name,
      if (containerId != null) 'containerId': containerId,
      if (containerId == null) 'confirmGlobal': confirmGlobal,
      if (expiresInDays != null) 'expiresInDays': expiresInDays,
    });
    return GitKeyCreated.fromJson(res.data as Map<String, dynamic>);
  }

  /// DELETE /gitkeys/:id — 撤销 key
  Future<void> deleteGitKey(int id) async {
    await dio.delete('/gitkeys/$id');
  }

  // ═══════════ AI 知识库扩展 ═══════════

  /// POST /import/share — 通过分享链接增量导入
  Future<Map<String, dynamic>> importByShare(String url) async {
    final res = await dio.post('/import/share', data: {'url': url});
    return res.data as Map<String, dynamic>;
  }

  /// GET /import/conversations — 列出已导入对话
  Future<List<UnifiedConversation>> importedConversations({
    int page = 1,
    int pageSize = 20,
  }) async {
    final res = await dio.get('/import/conversations',
        queryParameters: {'page': page, 'pageSize': pageSize});
    final list =
        (res.data as Map<String, dynamic>)['conversations'] as List<dynamic>;
    return list
        .map((e) => UnifiedConversation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ─────────── 续聊（DeepSeek） ───────────

  /// GET /continue-chat — 续聊对话列表
  Future<List<UnifiedConversation>> continueChatConversations() async {
    final res = await dio.get('/continue-chat');
    final list =
        (res.data as Map<String, dynamic>)['conversations'] as List<dynamic>;
    return list
        .map((e) => UnifiedConversation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// POST /continue-chat — 新建续聊对话
  Future<UnifiedConversation> createContinueChat({
    required String title,
    required String firstMessage,
    String model = 'deepseek-chat',
  }) async {
    final res = await dio.post('/continue-chat', data: {
      'title': title,
      'messages': [
        {'role': 'user', 'content': firstMessage}
      ],
      'model': model,
    });
    return UnifiedConversation.fromJson(
        (res.data as Map<String, dynamic>)['conversation']
            as Map<String, dynamic>);
  }

  /// GET /continue-chat/:id — 续聊对话详情
  Future<List<UnifiedMessage>> continueChatDetail(int id) async {
    final res = await dio.get('/continue-chat/$id');
    final list = ((res.data as Map<String, dynamic>)['conversation']
            as Map<String, dynamic>)['messages'] as List<dynamic>;
    return list
        .map((e) => UnifiedMessage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// SSE 流式发送续聊消息，返回完整响应文本
  Future<String> sendContinueChatMessage({
    required int conversationId,
    required String content,
    String? model,
    void Function(String delta)? onDelta,
  }) async {
    final res = await dio.post(
      '/continue-chat/$conversationId/message',
      data: {'content': content, if (model != null) 'model': model},
      options: Options(responseType: ResponseType.stream),
    );
    return _consumeSse(res, onDelta);
  }

  // ─────────── Agent 续聊（StepFun） ───────────

  Future<List<UnifiedConversation>> agentConversations() async {
    final res = await dio.get('/agent');
    final list =
        (res.data as Map<String, dynamic>)['conversations'] as List<dynamic>;
    return list
        .map((e) => UnifiedConversation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<UnifiedConversation> createAgentChat({
    required String title,
    required String firstMessage,
    String model = 'step-1o',
  }) async {
    final res = await dio.post('/agent', data: {
      'title': title,
      'messages': [
        {'role': 'user', 'content': firstMessage}
      ],
      'model': model,
    });
    return UnifiedConversation.fromJson(
        (res.data as Map<String, dynamic>)['conversation']
            as Map<String, dynamic>);
  }

  Future<List<UnifiedMessage>> agentDetail(int id) async {
    final res = await dio.get('/agent/$id');
    final list = ((res.data as Map<String, dynamic>)['conversation']
            as Map<String, dynamic>)['messages'] as List<dynamic>;
    return list
        .map((e) => UnifiedMessage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<String> sendAgentMessage({
    required int conversationId,
    required String content,
    String? model,
    void Function(String delta)? onDelta,
  }) async {
    final res = await dio.post(
      '/agent/$conversationId/message',
      data: {'content': content, if (model != null) 'model': model},
      options: Options(responseType: ResponseType.stream),
    );
    return _consumeSse(res, onDelta);
  }

  // ─────────── 记忆试卷 ───────────

  Future<List<TestPaperLite>> testPapers({int page = 1}) async {
    final res = await dio
        .get('/test-papers', queryParameters: {'page': page, 'pageSize': 20});
    final list =
        (res.data as Map<String, dynamic>)['papers'] as List<dynamic>;
    return list
        .map((e) => TestPaperLite.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> generateTestPaper({
    required String requirement,
    int questionCount = 10,
    String difficulty = 'medium',
    List<String>? types,
  }) async {
    final res = await dio.post('/test-papers/generate', data: {
      'requirement': requirement,
      'questionCount': questionCount,
      'difficulty': difficulty,
      if (types != null) 'types': types,
    });
    return res.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> testPaperJob(String jobId) async {
    final res = await dio.get('/test-papers/job/$jobId');
    return res.data as Map<String, dynamic>;
  }

  Future<TestPaperDetail> testPaperDetail(int id) async {
    final res = await dio.get('/test-papers/$id');
    return TestPaperDetail.fromJson(
        (res.data as Map<String, dynamic>)['paper']
            as Map<String, dynamic>);
  }

  Future<void> deleteTestPaper(int id) async {
    await dio.delete('/test-papers/$id');
  }

  // ─────────── Skills & MCP ───────────

  Future<List<Skill>> skills() async {
    final res = await dio.get('/skills');
    final list =
        (res.data as Map<String, dynamic>)['skills'] as List<dynamic>;
    return list.map((e) => Skill.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<McpServerModel>> mcpServers() async {
    final res = await dio.get('/mcp');
    final list =
        (res.data as Map<String, dynamic>)['servers'] as List<dynamic>;
    return list
        .map((e) => McpServerModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 消费 SSE 流，拼接 delta 并回调
  Future<String> _consumeSse(
    Response<dynamic> res,
    void Function(String delta)? onDelta,
  ) async {
    // Dio ResponseType.stream 时，data 是 ResponseBody，其 stream 为 Stream<List<int>>
    final dynamic body = res.data;
    final Stream<List<int>> stream =
        (body is ResponseBody) ? body.stream : (body as Stream<List<int>>);
    final buffer = StringBuffer();
    var fullContent = '';
    await for (final chunk in stream) {
      buffer.write(String.fromCharCodes(chunk));
      var str = buffer.toString();
      var idx = str.indexOf('\n\n');
      while (idx != -1) {
        final event = str.substring(0, idx);
        str = str.substring(idx + 2);
        for (final line in event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          final data = line.substring(5).trim();
          if (data.isEmpty) continue;
          try {
            final json = jsonDecode(data) as Map<String, dynamic>;
            if (json['error'] != null) {
              throw Exception(json['error'] as String);
            }
            if (json['delta'] != null) {
              final d = json['delta'] as String;
              fullContent += d;
              onDelta?.call(d);
            }
          } catch (_) {
            // ignore non-JSON
          }
        }
        idx = str.indexOf('\n\n');
      }
      buffer.clear();
      buffer.write(str);
    }
    return fullContent;
  }
}
