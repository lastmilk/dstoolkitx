import 'dart:convert';

import 'package:sqflite/sqflite.dart';

/// 轻量离线缓存：SQLite KV 表。
/// - `conv_list_<configId>`：会话列表 JSON（累计已拉取页）
/// - `conv_detail_<configId>_<convId>`：会话详情 JSON（看过的可离线回看）
class AppCache {
  AppCache._();

  static Database? _db;

  static Future<Database> get db async {
    if (_db != null) return _db!;
    final path = await getDatabasesPath();
    _db = await openDatabase(
      '$path/dstoolkit.db',
      version: 1,
      onCreate: (db, v) => db.execute(
        'CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)',
      ),
    );
    return _db!;
  }

  static Future<void> put(String key, Object? jsonValue) async {
    final database = await db;
    await database.insert(
      'kv',
      {'k': key, 'v': jsonEncode(jsonValue), 'updated_at': DateTime.now().millisecondsSinceEpoch},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  static Future<Map<String, dynamic>?> getJson(String key) async {
    final database = await db;
    final rows = await database.query('kv', where: 'k = ?', whereArgs: [key], limit: 1);
    if (rows.isEmpty) return null;
    try {
      return jsonDecode(rows.first['v'] as String) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<void> clearAll() async {
    final database = await db;
    await database.delete('kv');
  }

  // ── 业务封装 ─────────────────────────────
  static String convListKey(int configId) => 'conv_list_$configId';
  static String convDetailKey(int configId, String convId) => 'conv_detail_${configId}_$convId';
}
