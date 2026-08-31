import 'package:flutter_test/flutter_test.dart';

import 'package:dstoolkit_app/features/auth/auth_controller.dart';

void main() {
  test('PKCE challenge 为 verifier 的 BASE64URL(SHA256)', () {
    final pkce = generatePkce();
    // verifier 长度应在 43-128 之间（RFC 7636）
    expect(pkce.verifier.length, greaterThanOrEqualTo(43));
    expect(pkce.verifier.length, lessThanOrEqualTo(128));
    // challenge 不含 padding 与 + /
    expect(pkce.challenge.contains('='), isFalse);
    expect(pkce.challenge.contains('+'), isFalse);
    expect(pkce.challenge.contains('/'), isFalse);
  });

  test('AuthStatus 游客模式可浏览主界面', () {
    const state = AuthState(status: AuthStatus.guest);
    expect(state.canBrowse, isTrue);
    const loggedOut = AuthState(status: AuthStatus.loggedOut);
    expect(loggedOut.canBrowse, isFalse);
  });
}
