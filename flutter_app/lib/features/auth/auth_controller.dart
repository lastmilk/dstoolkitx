import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/api_constants.dart';
import '../../data/api/dio_client.dart';
import '../../data/api/oauth_api.dart';
import '../../data/api/v1_api.dart';
import '../../data/local/token_store.dart';
import '../../data/models/models.dart';

enum AuthStatus { unknown, loggedIn, guest, loggedOut }

class AuthState {
  const AuthState({required this.status, this.user});

  final AuthStatus status;
  final User? user;

  /// 游客或已登录（可进入主界面）
  bool get canBrowse => status == AuthStatus.guest || status == AuthStatus.loggedIn;

  AuthState copyWith({AuthStatus? status, User? user}) => AuthState(
        status: status ?? this.status,
        user: user ?? this.user,
      );
}

// ── Providers ─────────────────────────────────────────────

final tokenStoreProvider = Provider<TokenStore>((_) => TokenStore());
final tokenProviderProvider = Provider<TokenProvider>(
  (ref) => TokenStoreAdapter(ref.watch(tokenStoreProvider)),
);

final bareDioProvider = Provider<Dio>((_) => buildBareDio());
final oauthApiProvider =
    Provider<OAuthApi>((ref) => OAuthApi(ref.watch(bareDioProvider)));

/// 主 Dio（带 dstk_ 鉴权 + 自动刷新）
final dioProvider = Provider<Dio>((ref) {
  return buildDio(
    tokenProvider: ref.watch(tokenProviderProvider),
    oauthApi: ref.watch(oauthApiProvider),
    onAuthFailed: () => ref.read(authControllerProvider.notifier).forceLogout(),
  );
});

final v1ApiProvider = Provider<V1Api>((ref) => V1Api(ref.watch(dioProvider)));

// ── Controller ────────────────────────────────────────────

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState(status: AuthStatus.unknown)) {
    bootstrap();
  }

  final Ref _ref;

  TokenStore get _store => _ref.read(tokenStoreProvider);
  OAuthApi get _oauth => _ref.read(oauthApiProvider);
  V1Api get _api => _ref.read(v1ApiProvider);
  Dio get _bareDio => _ref.read(bareDioProvider);

  /// 启动时检查本地 token；无 token 但有游客标记则进入游客模式
  Future<void> bootstrap() async {
    final access = await _store.readAccess();
    if (access == null) {
      state = state.copyWith(status: AuthStatus.loggedOut);
      return;
    }
    try {
      final user = await _api.me();
      state = AuthState(status: AuthStatus.loggedIn, user: user);
    } catch (_) {
      // token 无效且刷新失败（拦截器已尽力）→ 登出
      await _store.clear();
      state = state.copyWith(status: AuthStatus.loggedOut);
    }
  }

  /// 跳过登录（游客模式）：部分功能不可用
  void enterGuestMode() {
    state = state.copyWith(status: AuthStatus.guest);
  }

  /// 游客退出 → 回到登录页
  void exitGuestMode() {
    state = state.copyWith(status: AuthStatus.loggedOut);
  }

  /// App 内账号密码登录：
  /// /auth/login 拿 JWT → /oauth/authorize（PKCE）拿 code → /oauth/token 换 dstk_ 令牌
  Future<String?> loginWithPassword({
    required String username,
    required String password,
  }) =>
      _passwordFlow(
        path: '/auth/login',
        username: username,
        password: password,
        usernameTakenHint: null,
      );

  /// App 内注册：/auth/register 成功后直接走登录流程
  Future<String?> register({
    required String username,
    required String password,
  }) =>
      _passwordFlow(
        path: '/auth/register',
        username: username,
        password: password,
        usernameTakenHint: '用户名已存在',
      );

  /// 密码登录/注册共用流程，返回 null 表示成功，否则返回错误信息
  Future<String?> _passwordFlow({
    required String path,
    required String username,
    required String password,
    String? usernameTakenHint,
  }) async {
    try {
      // 1. 密码换 JWT
      final authRes = await _bareDio.post(path, data: {
        'username': username,
        'password': password,
      });
      final jwt = (authRes.data as Map<String, dynamic>)['token'] as String;

      // 2. JWT + PKCE 换授权码
      final pkce = generatePkce();
      final redirectUrl = await _oauth.authorize(
        jwt: jwt,
        clientId: ApiConstants.clientId,
        redirectUri: ApiConstants.redirectUri,
        scope: ApiConstants.scopes.join(' '),
        state: _randomState(),
        codeChallenge: pkce.challenge,
      );
      final code = Uri.parse(redirectUrl).queryParameters['code'];
      if (code == null) return '授权失败：未取得授权码';

      // 3. 授权码换 dstk_ 令牌
      final pair = await _oauth.exchangeCode(
        code: code,
        redirectUri: ApiConstants.redirectUri,
        codeVerifier: pkce.verifier,
        clientId: ApiConstants.clientId,
      );
      await _store.write(
        access: pair.accessToken,
        refresh: pair.refreshToken,
      );
      final user = await _api.me();
      state = AuthState(status: AuthStatus.loggedIn, user: user);
      return null;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map<String, dynamic>) {
        final msg = data['error'] as String?;
        if (msg != null) return msg;
      }
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout) {
        return '网络连接失败，请检查网络';
      }
      return '请求失败，请稍后重试';
    } catch (_) {
      return '登录失败，请重试';
    }
  }

  /// 登出：吊销令牌 + 清本地
  Future<void> logout() async {
    final access = await _store.readAccess();
    if (access != null) {
      try {
        await _oauth.revoke(token: access);
      } catch (_) {/* 网络失败也要本地登出 */}
    }
    await _store.clear();
    state = state.copyWith(status: AuthStatus.loggedOut, user: null);
  }

  /// 鉴权彻底失败（refresh 失败）由 Dio 拦截器回调
  void forceLogout() {
    _store.clear();
    state = state.copyWith(status: AuthStatus.loggedOut, user: null);
  }

  String _randomState() {
    final r = Random.secure();
    return List<int>.generate(12, (_) => r.nextInt(256))
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));

// ── PKCE 工具 ─────────────────────────────────────────────

class PkcePair {
  const PkcePair({required this.verifier, required this.challenge});
  final String verifier;
  final String challenge;
}

/// 生成 PKCE code_verifier（43-128 字符）与 S256 challenge
PkcePair generatePkce() {
  final random = Random.secure();
  final bytes = List<int>.generate(32, (_) => random.nextInt(256));
  final verifier = base64UrlEncode(bytes).replaceAll('=', '');
  final digest = sha256.convert(verifier.codeUnits);
  final challenge = base64UrlEncode(digest.bytes).replaceAll('=', '');
  return PkcePair(verifier: verifier, challenge: challenge);
}
