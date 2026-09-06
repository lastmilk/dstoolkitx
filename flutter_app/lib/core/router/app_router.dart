import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/ai/import_page.dart';
import '../../features/ai/continue_chat_page.dart';
import '../../features/ai/test_paper_page.dart';
import '../../features/auth/auth_controller.dart';
import '../../features/auth/login_page.dart';
import '../../features/conversation/detail/conversation_detail_page.dart';
import '../../features/conversation/list/conversation_list_page.dart';
import '../../features/home/home_shell.dart';
import '../../features/profile/profile_page.dart';
import '../../features/search/search_page.dart';
import '../../features/stats/stats_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/conversations',
    redirect: (context, state) {
      final loggingIn = state.matchedLocation == '/login';
      switch (auth.status) {
        case AuthStatus.unknown:
          return null; // 等待 bootstrap
        case AuthStatus.loggedOut:
          return loggingIn ? null : '/login';
        case AuthStatus.loggedIn:
        case AuthStatus.guest: // 游客可浏览主界面（功能页内部做门禁）
          return loggingIn ? '/conversations' : null;
      }
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginPage(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            HomeShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/conversations',
              builder: (context, state) => const ConversationListPage(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/search',
              builder: (context, state) => const SearchPage(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/ai',
              builder: (context, state) => const ContinueChatPage(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/test-paper',
              builder: (context, state) => const TestPaperPage(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/profile',
              builder: (context, state) => const ProfilePage(),
            ),
            GoRoute(
              path: '/stats',
              builder: (context, state) => const StatsPage(),
            ),
            GoRoute(
              path: '/import',
              builder: (context, state) => const ImportPage(),
            ),
          ]),
        ],
      ),
      GoRoute(
        path: '/conversation/:configId/:convId',
        builder: (context, state) => ConversationDetailPage(
          configId: int.parse(state.pathParameters['configId']!),
          convId: state.pathParameters['convId']!,
        ),
      ),
    ],
  );
});
