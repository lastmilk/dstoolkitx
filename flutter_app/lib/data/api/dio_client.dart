import 'package:dio/dio.dart';

import '../../core/constants/api_constants.dart';
import 'oauth_api.dart';

/// 会话级鉴权失败通知（refresh 也失败 → 全局登出）
typedef OnAuthFailed = void Function();

/// 主 Dio 客户端：
/// - 请求拦截：注入 `Authorization: Bearer dstk_...`
/// - 401 拦截：refresh_token 轮换后重试一次；仍失败 → 通知登出
Dio buildDio({
  required TokenProvider tokenProvider,
  required OAuthApi oauthApi,
  OnAuthFailed? onAuthFailed,
}) {
  final dio = Dio(BaseOptions(
    baseUrl: ApiConstants.apiBase,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 60),
  ));

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final access = await tokenProvider.readAccess();
      if (access != null) {
        options.headers['Authorization'] = 'Bearer $access';
      }
      handler.next(options);
    },
    onError: (error, handler) async {
      final is401 = error.response?.statusCode == 401;
      final isTokenEndpoint = error.requestOptions.path.contains('/oauth/token');
      if (!is401 || isTokenEndpoint) return handler.reject(error);

      // 尝试 refresh（加锁防并发刷新）
      final refreshed = await _tryRefresh(tokenProvider, oauthApi);
      if (refreshed) {
        try {
          final retry = await dio.fetch(error.requestOptions);
          return handler.resolve(retry);
        } on DioException catch (e) {
          if (e.response?.statusCode == 401) onAuthFailed?.call();
          return handler.reject(e);
        }
      }
      onAuthFailed?.call();
      return handler.reject(error);
    },
  ));

  return dio;
}

Future<bool> _tryRefresh(TokenProvider tokenProvider, OAuthApi oauthApi) async {
  if (_refreshing) return false;
  _refreshing = true;
  try {
    final refresh = await tokenProvider.readRefresh();
    if (refresh == null) return false;
    final pair = await oauthApi.refresh(
      refreshToken: refresh,
      clientId: ApiConstants.clientId,
    );
    await tokenProvider.write(
      access: pair.accessToken,
      refresh: pair.refreshToken,
    );
    return true;
  } catch (_) {
    return false;
  } finally {
    _refreshing = false;
  }
}

bool _refreshing = false;

/// 裸 Dio（用于 /oauth/token、/oauth/revoke —— 无鉴权拦截）
Dio buildBareDio() => Dio(BaseOptions(
      baseUrl: ApiConstants.apiBase,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
    ));
