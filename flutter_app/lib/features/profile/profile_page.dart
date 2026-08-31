import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/api_constants.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';

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
