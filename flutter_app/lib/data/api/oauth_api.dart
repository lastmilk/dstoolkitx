import 'package:dio/dio.dart';

import '../local/token_store.dart';

/// OAuth2 令牌接口（不带鉴权拦截器的裸 Dio）
class OAuthApi {
  OAuthApi(this.dio);

  final Dio dio;

  /// App 内密码登录后：用 JWT 直接发起授权（无需 WebView），
  /// 返回 redirectUrl（其中含一次性 code）
  Future<String> authorize({
    required String jwt,
    required String clientId,
    required String redirectUri,
    required String scope,
    required String state,
    required String codeChallenge,
  }) async {
    final res = await dio.post(
      '/oauth/authorize',
      options: Options(headers: {'Authorization': 'Bearer $jwt'}),
      data: {
        'clientId': clientId,
        'redirectUri': redirectUri,
        'scope': scope,
        'state': state,
        'codeChallenge': codeChallenge,
        'codeChallengeMethod': 'S256',
      },
    );
    return (res.data as Map<String, dynamic>)['redirectUrl'] as String;
  }

  Future<TokenPair> exchangeCode({
    required String code,
    required String redirectUri,
    required String codeVerifier,
    required String clientId,
  }) async {
    final res = await dio.post('/oauth/token', data: {
      'grant_type': 'authorization_code',
      'code': code,
      'redirect_uri': redirectUri,
      'code_verifier': codeVerifier,
      'client_id': clientId,
    });
    return TokenPair.fromJson(res.data as Map<String, dynamic>);
  }

  Future<TokenPair> refresh({
    required String refreshToken,
    required String clientId,
  }) async {
    final res = await dio.post('/oauth/token', data: {
      'grant_type': 'refresh_token',
      'refresh_token': refreshToken,
      'client_id': clientId,
    });
    return TokenPair.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> revoke({required String token}) async {
    await dio.post('/oauth/revoke', data: {'token': token});
  }
}

class TokenPair {
  const TokenPair({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  factory TokenPair.fromJson(Map<String, dynamic> json) => TokenPair(
        accessToken: json['access_token'] as String,
        refreshToken: json['refresh_token'] as String,
      );
}

/// 供 Dio 拦截器使用的令牌读写接口（避免循环依赖）
abstract class TokenProvider {
  Future<String?> readAccess();
  Future<String?> readRefresh();
  Future<void> write({required String access, required String refresh});
  Future<void> clear();
}

class TokenStoreAdapter implements TokenProvider {
  TokenStoreAdapter(this._store);
  final TokenStore _store;

  @override
  Future<String?> readAccess() => _store.readAccess();
  @override
  Future<String?> readRefresh() => _store.readRefresh();
  @override
  Future<void> write({required String access, required String refresh}) =>
      _store.write(access: access, refresh: refresh);
  @override
  Future<void> clear() => _store.clear();
}
