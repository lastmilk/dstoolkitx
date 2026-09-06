import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';
import '../git/git_center_page.dart';

/// 个人中心：用户信息 + 等级徽章 + 升级（跳 Web）+ 登出
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;
    final neu = NeuColors.of(context);
    final isGuest = auth.status == AuthStatus.guest;

    return Scaffold(
      appBar: AppBar(title: const Text('我的')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── 用户/游客卡片 ──
          Container(
            padding: const EdgeInsets.all(20),
            decoration: NeuBoxDecoration(
              color: neu.surface,
              shadowDark: neu.shadowDark,
              shadowLight: neu.shadowLight,
            ),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: isGuest
                      ? Theme.of(context)
                          .colorScheme
                          .outline
                          .withValues(alpha: 0.15)
                      : Theme.of(context)
                          .colorScheme
                          .primary
                          .withValues(alpha: 0.15),
                  child: isGuest
                      ? Icon(Icons.person_off_outlined,
                          size: 30,
                          color: Theme.of(context).colorScheme.outline)
                      : Text(
                          (user?.username.isNotEmpty ?? false)
                              ? user!.username[0].toUpperCase()
                              : '?',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ),
                ),
                const SizedBox(height: 12),
                Text(
                  isGuest ? '游客' : (user?.username ?? '-'),
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                if (isGuest)
                  Text(
                    '登录后解锁对话、搜索与统计',
                    style: Theme.of(context).textTheme.bodySmall,
                  )
                else ...[
                  _TierBadge(tier: user?.tier ?? 'FREE'),
                  if (user?.createdAt != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        '注册于 ${DateFormat('yyyy-MM-dd').format(user!.createdAt!.toLocal())}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),

          if (isGuest) ...[
            // ── 游客：登录/注册入口 ──
            FilledButton.icon(
              onPressed: () =>
                  ref.read(authControllerProvider.notifier).exitGuestMode(),
              icon: const Icon(Icons.login_rounded),
              label: const Text('登录 / 注册'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
            const SizedBox(height: 12),
            _NeuListTile(
              icon: Icons.upgrade_rounded,
              title: '查看定价方案',
              trailing: const Icon(Icons.open_in_new_rounded, size: 18),
              onTap: () => _openWeb(ApiConstants.pricingUrl),
              surface: neu.surface,
              shadowDark: neu.shadowDark,
              shadowLight: neu.shadowLight,
            ),
          ] else ...[
            // ── 已登录：等级 + 订阅 + 网页版 ──
            _NeuListTile(
              icon: Icons.workspace_premium_outlined,
              title: '当前等级',
              trailing: _TierBadge(tier: user?.tier ?? 'FREE'),
              surface: neu.surface,
              shadowDark: neu.shadowDark,
              shadowLight: neu.shadowLight,
            ),
            const SizedBox(height: 12),

            // ── 升级（付费在 Web 解决）──
            _NeuListTile(
              icon: Icons.upgrade_rounded,
              title: '升级订阅 / 查看定价',
              trailing: const Icon(Icons.open_in_new_rounded, size: 18),
              onTap: () => _openWeb(ApiConstants.pricingUrl),
              surface: neu.surface,
              shadowDark: neu.shadowDark,
              shadowLight: neu.shadowLight,
            ),
            const SizedBox(height: 12),

            // ── 手机号绑定（传统注册未绑定用户：云端受限提示） ──
            if (user != null) ...[
              _NeuListTile(
                icon: Icons.phone_iphone_rounded,
                title: (user.phone?.isNotEmpty ?? false)
                    ? '手机号 ${user.phone}'
                    : user.needsPhoneForCloud
                        ? '绑定手机号（绑定后可用云端同步）'
                        : '绑定手机号',
                trailing: (user.phone?.isNotEmpty ?? false)
                    ? const Icon(Icons.check_circle_rounded,
                        size: 18, color: Color(0xFF00897B))
                    : const Icon(Icons.chevron_right_rounded, size: 20),
                surface: neu.surface,
                shadowDark: neu.shadowDark,
                shadowLight: neu.shadowLight,
                onTap: (user.phone?.isNotEmpty ?? false)
                    ? null
                    : () => _showBindPhoneSheet(context),
              ),
              const SizedBox(height: 12),
            ],

            // ── Git 一体化生态：凭证 + 对话容器同步 ──
            _NeuListTile(
              icon: Icons.merge_rounded,
              title: 'Git 同步中心（凭证 / 容器增量同步）',
              trailing: const Icon(Icons.chevron_right_rounded, size: 20),
              surface: neu.surface,
              shadowDark: neu.shadowDark,
              shadowLight: neu.shadowLight,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const GitCenterPage()),
              ),
            ),
            const SizedBox(height: 12),

            _NeuListTile(
              icon: Icons.language_rounded,
              title: '前往网页版',
              trailing: const Icon(Icons.open_in_new_rounded, size: 18),
              onTap: () => _openWeb(ApiConstants.webBase),
              surface: neu.surface,
              shadowDark: neu.shadowDark,
              shadowLight: neu.shadowLight,
            ),
            const SizedBox(height: 32),

            // ── 登出 ──
            FilledButton.tonalIcon(
              onPressed: () => _confirmLogout(context, ref),
              icon: const Icon(Icons.logout_rounded),
              label: const Text('退出登录'),
              style: FilledButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.errorContainer,
                foregroundColor: Theme.of(context).colorScheme.onErrorContainer,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),
          Text(
            isGuest ? 'DsToolKit v1.0.0' : 'DsToolKit v1.0.0\n付费与订阅管理均在网页端完成',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Future<void> _openWeb(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  void _confirmLogout(BuildContext context, WidgetRef ref) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('退出登录'),
        content: const Text('确定要退出当前账号吗？'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              ref.read(authControllerProvider.notifier).logout();
            },
            child: const Text('退出'),
          ),
        ],
      ),
    );
  }

  void _showBindPhoneSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const Padding(
        padding: EdgeInsets.only(bottom: 24),
        child: _BindPhoneSheet(),
      ),
    );
  }
}

/// 绑定手机号底部弹层：极验 + 短信验证码
class _BindPhoneSheet extends ConsumerStatefulWidget {
  const _BindPhoneSheet();

  @override
  ConsumerState<_BindPhoneSheet> createState() => _BindPhoneSheetState();
}

class _BindPhoneSheetState extends ConsumerState<_BindPhoneSheet> {
  bool _loading = false;
  bool _sendLoading = false;
  int _countdown = 0;
  Timer? _timer;
  String? _error;

  final _phoneCtrl = TextEditingController();
  final _codeCtrl = TextEditingController();
  static final RegExp _phoneRe = RegExp(r'^1[3-9]\d{9}$');

  @override
  void dispose() {
    _timer?.cancel();
    _phoneCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
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
    final error = await ref
        .read(authControllerProvider.notifier)
        .bindPhoneSendCode(phone);
    if (!mounted) return;
    setState(() => _sendLoading = false);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    _countdown = 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _countdown--);
      if (_countdown <= 0) t.cancel();
    });
  }

  Future<void> _bind() async {
    if (_loading) return;
    final phone = _phoneCtrl.text.trim();
    final code = _codeCtrl.text.trim();
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
        .bindPhone(phone: phone, code: code);
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _loading = false;
        _error = error;
      });
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
          24, 20, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '绑定手机号',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            '绑定后可使用云端同步与多端协作',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.outline),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _phoneCtrl,
            keyboardType: TextInputType.phone,
            maxLength: 11,
            decoration: InputDecoration(
              labelText: '手机号',
              prefixIcon: const Icon(Icons.phone_android_rounded),
              counterText: '',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _codeCtrl,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: InputDecoration(
              labelText: '验证码',
              prefixIcon: const Icon(Icons.sms_outlined),
              counterText: '',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
              suffixIcon: TextButton(
                onPressed: _sendLoading || _countdown > 0 ? null : _send,
                child: Text(_countdown > 0 ? '${_countdown}s' : '获取验证码'),
              ),
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _loading ? null : _bind,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
            ),
            child: _loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('绑定'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(color: theme.colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

class _TierBadge extends StatelessWidget {
  const _TierBadge({required this.tier});

  final String tier;

  (Color, String) get _style => switch (tier) {
        'ULTIMATE' => (const Color(0xFF9C27B0), 'ULTIMATE'),
        'TEAM' => (const Color(0xFF00897B), 'TEAM'),
        'PLUS' => (const Color(0xFF4A6CF7), 'PLUS'),
        'PRO' => (const Color(0xFFF57C00), 'PRO'),
        _ => (const Color(0xFF90A4AE), 'FREE'),
      };

  @override
  Widget build(BuildContext context) {
    final (color, label) = _style;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
          color: color,
        ),
      ),
    );
  }
}

class _NeuListTile extends StatelessWidget {
  const _NeuListTile({
    required this.icon,
    required this.title,
    required this.surface,
    required this.shadowDark,
    required this.shadowLight,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color surface;
  final Color shadowDark;
  final Color shadowLight;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: NeuBoxDecoration(
          color: surface,
          shadowDark: shadowDark,
          shadowLight: shadowLight,
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(title, style: Theme.of(context).textTheme.bodyLarge),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}
