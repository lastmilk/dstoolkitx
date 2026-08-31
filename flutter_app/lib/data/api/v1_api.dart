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
}
