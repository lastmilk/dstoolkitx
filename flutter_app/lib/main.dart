import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:git2dart/git2dart.dart';

import 'app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // git2dart 平台初始化（Android/iOS 需先加载 libgit2 与证书）
  await PlatformSpecific.initialize();
  runApp(const ProviderScope(child: DsToolkitApp()));
}
