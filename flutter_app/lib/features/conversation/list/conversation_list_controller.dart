import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/api/v1_api.dart';
import '../../../data/local/app_cache.dart';
import '../../../data/models/models.dart';
import '../../auth/auth_controller.dart';

class ConversationListState {
  const ConversationListState({
    this.configs = const [],
    this.selectedConfigId,
    this.conversations = const [],
    this.total = 0,
    this.page = 0,
    this.loading = false,
    this.loadingMore = false,
    this.error,
    this.offline = false,
  });

  final List<DeepseekConfig> configs;
  final int? selectedConfigId;
  final List<ConversationLite> conversations;
  final int total;
  final int page;
  final bool loading;
  final bool loadingMore;
  final String? error;
  final bool offline;

  bool get hasMore => conversations.length < total;

  ConversationListState copyWith({
    List<DeepseekConfig>? configs,
    int? selectedConfigId,
    List<ConversationLite>? conversations,
    int? total,
    int? page,
    bool? loading,
    bool? loadingMore,
    String? error,
    bool? offline,
    bool clearError = false,
  }) =>
      ConversationListState(
        configs: configs ?? this.configs,
        selectedConfigId: selectedConfigId ?? this.selectedConfigId,
        conversations: conversations ?? this.conversations,
        total: total ?? this.total,
        page: page ?? this.page,
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        error: clearError ? null : (error ?? this.error),
        offline: offline ?? this.offline,
      );
}

class ConversationListController extends StateNotifier<ConversationListState> {
  ConversationListController(this._api) : super(const ConversationListState()) {
    _init();
  }

  final V1Api _api;
  static const _pageSize = 20;

  Future<void> _init() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final configs = await _api.configs();
      if (configs.isEmpty) {
        state = state.copyWith(configs: configs, loading: false);
        return;
      }
      // 恢复上次选择的 config
      final first = configs.first.id;
      state = state.copyWith(configs: configs, selectedConfigId: first);
      await _loadPage(1);
    } catch (e) {
      state = state.copyWith(loading: false, error: '加载失败，请检查网络后下拉重试');
    }
  }

  Future<void> selectConfig(int configId) async {
    state = state.copyWith(
        selectedConfigId: configId, conversations: [], total: 0, page: 0);
    await _loadPage(1);
  }

  Future<void> refresh() async {
    final configId = state.selectedConfigId;
    if (configId == null) return _init();
    state = state.copyWith(conversations: [], total: 0, page: 0);
    await _loadPage(1);
  }

  Future<void> loadMore() async {
    if (state.loadingMore || !state.hasMore) return;
    await _loadPage(state.page + 1);
  }

  Future<void> _loadPage(int page) async {
    final configId = state.selectedConfigId;
    if (configId == null) return;
    state = page == 1
        ? state.copyWith(loading: true, clearError: true)
        : state.copyWith(loadingMore: true);
    try {
      final paged = await _api.conversations(
        configId: configId,
        page: page,
        pageSize: _pageSize,
      );
      final merged = page == 1
          ? paged.records
          : [...state.conversations, ...paged.records];
      state = state.copyWith(
        conversations: merged,
        total: paged.total,
        page: paged.page,
        loading: false,
        loadingMore: false,
        offline: false,
      );
      // 缓存列表（累计）供离线回看
      await AppCache.put(
        AppCache.convListKey(configId),
        {
          'records': [for (final c in merged) _convJson(c)]
        },
      );
    } catch (e) {
      // 网络失败 → 尝试离线缓存
      if (page == 1) {
        final cached = await AppCache.getJson(AppCache.convListKey(configId));
        if (cached != null) {
          final records = (cached['records'] as List<dynamic>? ?? [])
              .map((e) => ConversationLite.fromJson(e as Map<String, dynamic>))
              .toList();
          state = state.copyWith(
            conversations: records,
            total: records.length,
            page: 1,
            loading: false,
            offline: true,
          );
          return;
        }
      }
      state = state.copyWith(
        loading: false,
        loadingMore: false,
        error: '网络连接失败',
      );
    }
  }

  Map<String, dynamic> _convJson(ConversationLite c) => {
        'id': c.id,
        'deepseekConvId': c.deepseekConvId,
        'title': c.title,
        'insertedAt': c.insertedAt?.toIso8601String(),
        'updatedAt': c.updatedAt?.toIso8601String(),
        'turnCount': c.turnCount,
      };
}

final conversationListProvider = StateNotifierProvider.autoDispose<
        ConversationListController, ConversationListState>(
    (ref) => ConversationListController(ref.watch(v1ApiProvider)));
