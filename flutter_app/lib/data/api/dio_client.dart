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

      // 尝试 refresh（并发 401 共享同一次刷新，刷新成功后各自重试）
      final refreshed = await _ensureRefresh(tokenProvider, oauthApi);
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

/// 单飞刷新：并发触发时共享同一个进行中的 Future，
/// 避免「后到的 401 因锁被占直接 onAuthFailed」把用户误踢下线。
Future<bool> _ensureRefresh(
    TokenProvider tokenProvider, OAuthApi oauthApi) {
  final inFlight = _refreshInFlight;
  if (inFlight != null) return inFlight;
  final task = _doRefresh(tokenProvider, oauthApi);
  _refreshInFlight = task;
  // 完成后清槽（无论成败，下一次 401 重新发起刷新）
  task.whenComplete(() => _refreshInFlight = null);
  return task;
}

Future<bool> _doRefresh(
    TokenProvider tokenProvider, OAuthApi oauthApi) async {
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
  }
}

Future<bool>? _refreshInFlight;

/// 裸 Dio（用于 /oauth/token、/oauth/revoke —— 无鉴权拦截）
Dio buildBareDio() => Dio(BaseOptions(
      baseUrl: ApiConstants.apiBase,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
    ));
