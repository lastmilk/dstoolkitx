import 'dart:io';

import 'package:flutter/services.dart';

/// 原生认证桥（Android only）：
/// - 极验 GT4 行为验证（geetestVerify）
/// - 阿里云号码认证一键登录（numberAuth*）
class NativeAuthBridge {
  static const MethodChannel _channel = MethodChannel('dstoolkit/auth');

  /// 极验 GT4 App captchaId
  static const String geetestAppCaptchaId =
      'fd925dfbb79efc2467eb99cd89fcd512';

  /// 当前平台是否支持原生桥（仅 Android 集成了 aar）
  bool get isSupported => Platform.isAndroid;

  /// 弹出极验验证，成功返回二次校验四参数；失败/取消抛 PlatformException
  Future<Map<String, String>> geetestVerify({String? captchaId}) async {
    if (!isSupported) throw UnsupportedError('当前平台不支持原生极验');
    final res = await _channel
        .invokeMethod<Map<dynamic, dynamic>>('geetestVerify', {
      'captchaId': captchaId ?? geetestAppCaptchaId,
    });
    return res?.map((k, v) => MapEntry(k as String, v as String)) ?? {};
  }

  /// 一键登录环境是否可用（SIM 卡 + 运营商支持 + 控制台配置就绪）
  Future<bool> numberAuthCheckEnv() async {
    if (!isSupported) return false;
    try {
      return await _channel.invokeMethod<bool>('numberAuthCheckEnv') ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// 拉起运营商授权页，成功返回 accessToken（换手机号用）；失败/取消抛 PlatformException
  Future<String> numberAuthGetLoginToken({int timeoutMs = 5000}) async {
    if (!isSupported) throw UnsupportedError('当前平台不支持一键登录');
    return await _channel.invokeMethod<String>('numberAuthGetLoginToken', {
          'timeoutMs': timeoutMs,
        }) ??
        (throw PlatformException(code: 'NUMBER_AUTH_FAILED', message: '未取得令牌'));
  }

  /// 用户关闭授权页后调用，回到 App
  Future<void> numberAuthQuit() async {
    if (!isSupported) return;
    try {
      await _channel.invokeMethod('numberAuthQuit');
    } on PlatformException {
      /* 忽略 */
    }
  }
}
