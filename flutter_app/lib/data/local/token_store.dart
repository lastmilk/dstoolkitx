import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Token 对的安全存储（access = dstk_...，refresh = rt_...）
class TokenStore {
  TokenStore();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _kAccess = 'dstk_access_token';
  static const _kRefresh = 'dstk_refresh_token';

  Future<String?> readAccess() => _safeRead(_kAccess);
  Future<String?> readRefresh() => _safeRead(_kRefresh);

  Future<void> write({required String access, required String refresh}) async {
    try {
      await _storage.write(key: _kAccess, value: access);
      await _storage.write(key: _kRefresh, value: refresh);
    } catch (_) {
      // EncryptedSharedPreferences 偶发 KeyStore 异常：写失败不应崩溃
    }
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _kAccess);
      await _storage.delete(key: _kRefresh);
    } catch (_) {/* 忽略 */}
  }

  /// 部分机型 Keystore 损坏导致读取抛 AEADBadTagException：
  /// 视为无 token 并清掉坏数据，避免调用方卡死/崩溃
  Future<String?> _safeRead(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      try {
        await _storage.delete(key: key);
      } catch (_) {}
      return null;
    }
  }
}
