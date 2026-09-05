import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// 保存在本机的 Git 推送凭证（GitUsername + Git APIKey，仅客户端本地持有）
class GitCred {
  const GitCred({
    required this.gitUsername,
    required this.apiKey,
    this.keyId,
    required this.scope,
    this.containerId,
  });

  final String gitUsername;
  final String apiKey;
  final int? keyId;
  final String scope; // global / container
  final int? containerId;

  /// 该凭证能否用于指定容器（global 可用全部；container 仅匹配对应容器）
  bool matchesContainer(int configId) =>
      scope == 'global' || (scope == 'container' && containerId == configId);

  Map<String, dynamic> toJson() => {
        'gitUsername': gitUsername,
        'apiKey': apiKey,
        if (keyId != null) 'keyId': keyId,
        'scope': scope,
        if (containerId != null) 'containerId': containerId,
      };

  factory GitCred.fromJson(Map<String, dynamic> json) => GitCred(
        gitUsername: json['gitUsername'] as String,
        apiKey: json['apiKey'] as String,
        keyId: (json['keyId'] as num?)?.toInt(),
        scope: json['scope'] as String? ?? 'container',
        containerId: (json['containerId'] as num?)?.toInt(),
      );
}

/// Git 凭证 + 同步基线记账（安全存储）
class GitCredStore {
  GitCredStore();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _kCred = 'dstk_git_cred';
  static const _kBaseCommits = 'dstk_git_base_commits';

  // ── 凭证 ──

  Future<GitCred?> read() async {
    final raw = await _storage.read(key: _kCred);
    if (raw == null) return null;
    try {
      return GitCred.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  /// 取匹配指定容器的凭证；不匹配返回 null
  Future<GitCred?> readFor(int configId) async {
    final cred = await read();
    if (cred == null || !cred.matchesContainer(configId)) return null;
    return cred;
  }

  Future<void> save(GitCred cred) =>
      _storage.write(key: _kCred, value: jsonEncode(cred.toJson()));

  Future<void> clear() => _storage.delete(key: _kCred);

  // ── 基线记账（repoId → 上次成功同步后的远端 HEAD） ──

  Future<Map<String, String>> _readBaseCommits() async {
    final raw = await _storage.read(key: _kBaseCommits);
    if (raw == null) return {};
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return map.map((k, v) => MapEntry(k, v as String));
    } catch (_) {
      return {};
    }
  }

  Future<String?> readBaseCommit(String repoId) async =>
      (await _readBaseCommits())[repoId];

  Future<void> setBaseCommit(String repoId, String sha) async {
    final map = await _readBaseCommits();
    map[repoId] = sha;
    await _storage.write(key: _kBaseCommits, value: jsonEncode(map));
  }
}
