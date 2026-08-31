import 'package:flutter/material.dart';

/// Neu-morphism（新拟态）软 UI 主题。
class AppTheme {
  AppTheme._();

  static const Color primary = Color(0xFF4A6CF7);

  static ThemeData light() => _build(
        brightness: Brightness.light,
        background: const Color(0xFFE8ECF3),
        surface: const Color(0xFFFDFDFE),
        textPrimary: const Color(0xFF2C3E5D),
        textSecondary: const Color(0xFF6B7A99),
        shadowDark: const Color(0x59A3B1C6),
        shadowLight: const Color(0xE6FFFFFF),
      );

  static ThemeData dark() => _build(
        brightness: Brightness.dark,
        background: const Color(0xFF232936),
        surface: const Color(0xFF2B3242),
        textPrimary: const Color(0xFFE4E9F2),
        textSecondary: const Color(0xFF9AA7BF),
        shadowDark: const Color(0xCC141821),
        shadowLight: const Color(0x33424D63),
      );

  static ThemeData _build({
    required Brightness brightness,
    required Color background,
    required Color surface,
    required Color textPrimary,
    required Color textSecondary,
    required Color shadowDark,
    required Color shadowLight,
  }) {
    final scheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: brightness,
    ).copyWith(
      surface: surface,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 17,
          fontWeight: FontWeight.w600,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: primary.withValues(alpha: 0.15),
        elevation: 0,
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 11, color: textSecondary),
        ),
      ),
      dividerColor: textSecondary.withValues(alpha: 0.15),
    );
  }
}

/// 新拟态卡片装饰：双阴影（右下深 / 左上浅）+ 大圆角
class NeuBoxDecoration extends BoxDecoration {
  NeuBoxDecoration({
    Color color = Colors.white,
    Color shadowDark = const Color(0x59A3B1C6),
    Color shadowLight = const Color(0xE6FFFFFF),
    double radius = 16,
  }) : super(
          color: color,
          borderRadius: BorderRadius.circular(radius),
          boxShadow: [
            BoxShadow(
              color: shadowDark,
              offset: const Offset(6, 6),
              blurRadius: 14,
            ),
            BoxShadow(
              color: shadowLight,
              offset: const Offset(-6, -6),
              blurRadius: 14,
            ),
          ],
        );
}

/// 主题相关的新拟态色板（便于按亮暗模式取色）
class NeuColors extends ThemeExtension<NeuColors> {
  const NeuColors({
    required this.background,
    required this.surface,
    required this.textPrimary,
    required this.textSecondary,
    required this.shadowDark,
    required this.shadowLight,
  });

  final Color background;
  final Color surface;
  final Color textPrimary;
  final Color textSecondary;
  final Color shadowDark;
  final Color shadowLight;

  static const light = NeuColors(
    background: Color(0xFFE8ECF3),
    surface: Color(0xFFFDFDFE),
    textPrimary: Color(0xFF2C3E5D),
    textSecondary: Color(0xFF6B7A99),
    shadowDark: Color(0x59A3B1C6),
    shadowLight: Color(0xE6FFFFFF),
  );

  static const dark = NeuColors(
    background: Color(0xFF232936),
    surface: Color(0xFF2B3242),
    textPrimary: Color(0xFFE4E9F2),
    textSecondary: Color(0xFF9AA7BF),
    shadowDark: Color(0xCC141821),
    shadowLight: Color(0x33424D63),
  );

  static NeuColors of(BuildContext context) =>
      Theme.of(context).extension<NeuColors>() ?? light;

  @override
  NeuColors copyWith({
    Color? background,
    Color? surface,
    Color? textPrimary,
    Color? textSecondary,
    Color? shadowDark,
    Color? shadowLight,
  }) =>
      NeuColors(
        background: background ?? this.background,
        surface: surface ?? this.surface,
        textPrimary: textPrimary ?? this.textPrimary,
        textSecondary: textSecondary ?? this.textSecondary,
        shadowDark: shadowDark ?? this.shadowDark,
        shadowLight: shadowLight ?? this.shadowLight,
      );

  @override
  NeuColors lerp(NeuColors? other, double t) {
    if (other == null) return this;
    return NeuColors(
      background: Color.lerp(background, other.background, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      shadowDark: Color.lerp(shadowDark, other.shadowDark, t)!,
      shadowLight: Color.lerp(shadowLight, other.shadowLight, t)!,
    );
  }
}

/// 便捷方法：给 MaterialApp extensions 注册两套新拟态色板
ThemeExtension<NeuColors> neuColorsFor(Brightness brightness) =>
    brightness == Brightness.dark ? NeuColors.dark : NeuColors.light;
