import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/auth/native_auth_bridge.dart';
import 'auth_controller.dart';

/// 登录页：一键登录（主）+ 短信验证码（降级）+ 账号密码（保留）+ 游客模式
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

enum _LoginMode { sms, password }

class _LoginPageState extends ConsumerState<LoginPage> {
  bool _isRegister = false; // 密码模式：登录 / 注册
  bool _obscure = true;
  bool _loading = false; // 密码 / 短信登录提交中
  bool _oneClickLoading = false;
  bool _numberAuthAvailable = false;
  bool _sendLoading = false;
  int _countdown = 0;
  Timer? _countdownTimer;
  _LoginMode _mode = _LoginMode.sms;
  String? _error;

  final _bridge = NativeAuthBridge();

  final _formKey = GlobalKey<FormState>();
  final _phoneCtrl = TextEditingController();
  final _smsCodeCtrl = TextEditingController();
  final _usernameCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  static final RegExp _phoneRe = RegExp(r'^1[3-9]\d{9}$');

  @override
  void initState() {
    super.initState();
    if (_bridge.isSupported) {
      _bridge.numberAuthCheckEnv().then((ok) {
        if (mounted) setState(() => _numberAuthAvailable = ok);
      });
    }
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _phoneCtrl.dispose();
    _smsCodeCtrl.dispose();
    _usernameCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _countdown = 60;
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _countdown--);
      if (_countdown <= 0) t.cancel();
    });
  }

  /// 一键登录：原生 SDK 拉起运营商授权页
  Future<void> _oneClickLogin() async {
    if (_oneClickLoading) return;
    setState(() {
      _oneClickLoading = true;
      _error = null;
    });
    final error =
        await ref.read(authControllerProvider.notifier).numberAuthLogin();
    if (!mounted) return;
    setState(() => _oneClickLoading = false);
    if (error != null) setState(() => _error = error);
    // 成功时路由 redirect 自动跳转
  }

  /// 发送短信验证码（原生极验 → /auth/sms/send）
  Future<void> _sendSmsCode() async {
    if (_countdown > 0 || _sendLoading) return;
    final phone = _phoneCtrl.text.trim();
    if (!_phoneRe.hasMatch(phone)) {
      setState(() => _error = '请输入正确的手机号');
      return;
    }
    setState(() {
      _sendLoading = true;
      _error = null;
    });
    final error = await ref.read(authControllerProvider.notifier).smsSend(phone);
    if (!mounted) return;
    setState(() => _sendLoading = false);
    if (error != null) {
      setState(() => _error = error);
    } else {
      _startCountdown();
    }
  }

  /// 短信验证码登录（新手机号自动注册）
  Future<void> _smsLogin() async {
    if (_loading) return;
    final phone = _phoneCtrl.text.trim();
    final code = _smsCodeCtrl.text.trim();
    if (!_phoneRe.hasMatch(phone)) {
      setState(() => _error = '请输入正确的手机号');
      return;
    }
    if (code.isEmpty) {
      setState(() => _error = '请输入验证码');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    final error = await ref
        .read(authControllerProvider.notifier)
        .smsLogin(phone: phone, code: code);
    if (!mounted) return;
    setState(() => _loading = false);
    if (error != null) setState(() => _error = error);
  }

  /// 密码登录 / 注册（原生极验 → /auth/login|register）
  Future<void> _passwordSubmit() async {
    if (_loading) return;
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final notifier = ref.read(authControllerProvider.notifier);
    String? error;
    try {
      final captcha = await _bridge.geetestVerify();
      error = _isRegister
          ? await notifier.register(
              username: _usernameCtrl.text.trim(),
              password: _passwordCtrl.text,
              captcha: captcha,
            )
          : await notifier.loginWithPassword(
              username: _usernameCtrl.text.trim(),
              password: _passwordCtrl.text,
              captcha: captcha,
            );
    } on Exception {
      error = '人机验证失败，请重试';
    }
    if (!mounted) return;
    setState(() => _loading = false);
    if (error != null) setState(() => _error = error);
    // 成功时路由 redirect 会自动跳转
  }

  void _enterGuest() {
    ref.read(authControllerProvider.notifier).enterGuestMode();
  }

  InputDecoration _decoration(
    String label,
    IconData icon, {
    Widget? suffix,
  }) =>
      InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
        suffixIcon: suffix,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.auto_awesome_rounded,
                    size: 56, color: theme.colorScheme.primary),
                const SizedBox(height: 12),
                Text(
                  'DsToolKit',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                Text(
                  '随身查看你的 DeepSeek 对话',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: theme.colorScheme.outline),
                ),
                const SizedBox(height: 32),

                // ── 一键登录（环境可用时展示，主入口） ──
                if (_numberAuthAvailable) ...[
                  FilledButton.icon(
                    onPressed: _oneClickLoading ? null : _oneClickLogin,
                    icon: _oneClickLoading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.sim_card_rounded),
                    label: const Text('本机号码一键登录',
                        style: TextStyle(fontSize: 16)),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(children: [
                    const Expanded(child: Divider()),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text('或',
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: theme.colorScheme.outline)),
                    ),
                    const Expanded(child: Divider()),
                  ]),
                  const SizedBox(height: 16),
                ],

                // ── 方式切换：验证码登录（默认）/ 密码登录 ──
                SegmentedButton<_LoginMode>(
                  segments: const [
                    ButtonSegment(
                        value: _LoginMode.sms, label: Text('验证码登录')),
                    ButtonSegment(
                        value: _LoginMode.password, label: Text('密码登录')),
                  ],
                  selected: {_mode},
                  onSelectionChanged: (s) => setState(() {
                    _mode = s.first;
                    _error = null;
                  }),
                ),
                const SizedBox(height: 20),

                if (_mode == _LoginMode.sms) ...[
                  // ── 验证码登录 ──
                  TextFormField(
                    controller: _phoneCtrl,
                    keyboardType: TextInputType.phone,
                    maxLength: 11,
                    textInputAction: TextInputAction.next,
                    decoration: _decoration(
                        '手机号', Icons.phone_android_rounded),
                    validator: (v) =>
                        !_phoneRe.hasMatch(v?.trim() ?? '') ? '请输入正确的手机号' : null,
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: _smsCodeCtrl,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _loading ? null : _smsLogin(),
                    decoration: _decoration(
                      '验证码',
                      Icons.sms_outlined,
                      suffix: TextButton(
                        onPressed: _sendLoading || _countdown > 0
                            ? null
                            : _sendSmsCode,
                        child: Text(_countdown > 0
                            ? '${_countdown}s'
                            : '获取验证码'),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading ? null : _smsLogin,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('登录 / 注册',
                            style: TextStyle(fontSize: 16)),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '未注册的手机号将自动创建账号',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall
                        ?.copyWith(color: theme.colorScheme.outline),
                  ),
                ] else ...[
                  // ── 密码登录 / 注册 ──
                  Form(
                    key: _formKey,
                    child: Column(
                      children: [
                        TextFormField(
                          controller: _usernameCtrl,
                          autofillHints: const [AutofillHints.username],
                          textInputAction: TextInputAction.next,
                          decoration: _decoration(
                              '用户名', Icons.person_outline_rounded),
                          validator: (v) {
                            final s = v?.trim() ?? '';
                            if (s.isEmpty) return '请输入用户名';
                            if (s.length < 2) return '用户名至少 2 位';
                            return null;
                          },
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _passwordCtrl,
                          obscureText: _obscure,
                          autofillHints: _isRegister
                              ? const [AutofillHints.newPassword]
                              : const [AutofillHints.password],
                          textInputAction: TextInputAction.done,
                          onFieldSubmitted: (_) =>
                              _loading ? null : _passwordSubmit(),
                          decoration: _decoration(
                            '密码',
                            Icons.lock_outline_rounded,
                            suffix: IconButton(
                              icon: Icon(_obscure
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined),
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                          ),
                          validator: (v) {
                            final s = v ?? '';
                            if (s.isEmpty) return '请输入密码';
                            if (s.length < 6) return '密码至少 6 位';
                            return null;
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading ? null : _passwordSubmit,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                    ),
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(_isRegister ? '注册并登录' : '登录',
                            style: const TextStyle(fontSize: 16)),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _loading
                        ? null
                        : () => setState(() {
                              _isRegister = !_isRegister;
                              _error = null;
                            }),
                    child: Text(_isRegister ? '已有账号？去登录' : '没有账号？注册新账号'),
                  ),
                ],

                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ],

                const SizedBox(height: 12),
                TextButton(
                  onPressed: _loading || _oneClickLoading ? null : _enterGuest,
                  child: const Text('先看看 · 以游客模式进入'),
                ),
                const SizedBox(height: 8),
                Text(
                  '游客模式下对话、搜索、统计不可用',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.outline),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
