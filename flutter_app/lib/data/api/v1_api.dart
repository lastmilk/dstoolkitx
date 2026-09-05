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
}
