/**
 * `<GlassTabBar />`
 *
 * The floating glass pill tab bar from brief Section 4.3:
 *   * 64 pt tall, 16 pt side margins, floating 12 pt above the bottom safe area
 *   * radius 32, `fillStrong` + high blur
 *   * active tab = matcha500 icon + label on a matcha-tinted glass capsule
 *   * centre **Add** button = 56 pt matcha500 orb that rises above the bar
 *   * content scrolls *under* the bar (screens add the bottom inset themselves)
 */

import { memo, useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ChartNoAxesCombined, House, ReceiptText, ShoppingBasket, Plus, type LucideIcon } from 'lucide-react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useAppTheme } from '../../hooks/useAppTheme';
import { openAddExpense } from '../../state/addExpenseStore';
import { useSheetOverlayStore } from '../../state/sheetOverlayStore';
import { colors } from '../../../theme/colors';
import { layout, typeScale } from '../../../theme/typography';
import { tapHaptic } from '../../lib/haptics';

/** Bottom padding every scrollable screen needs so content clears the bar. */
export const TAB_BAR_INSET = layout.tabBarHeight + layout.tabBarFloat + 40;

export interface TabRouteMeta {
  label: string;
  icon: LucideIcon;
}

export const TAB_ROUTES: Record<string, TabRouteMeta> = {
  index: { label: 'Home', icon: House },
  history: { label: 'History', icon: ReceiptText },
  groceries: { label: 'Groceries', icon: ShoppingBasket },
  reports: { label: 'Reports', icon: ChartNoAxesCombined },
};

export function tabOptionsFor(routeName: string): TabRouteMeta {
  return TAB_ROUTES[routeName] ?? { label: 'Tab', icon: ChartNoAxesCombined };
}

function GlassTabBarImpl({ state, navigation, insets }: BottomTabBarProps) {
  const { glass, solidGlass, palette } = useAppTheme();
  // A sheet presented inside a tab scene (History filters) would otherwise sit
  // *under* this bar — the tab bar renders after the scenes, so its pill + orb
  // cover the sheet's action row. Hide while such a sheet is open.
  const overlayOpen = useSheetOverlayStore((s) => s.open);

  const handlePress = useCallback(
    (route: { key: string; name: string }, isFocused: boolean) => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (isFocused && !event.defaultPrevented) return;
      tapHaptic();
      navigation.navigate(route.name);
    },
    [navigation],
  );

  const bottomInset = Math.max(insets.bottom, layout.tabBarFloat);

  if (overlayOpen) return null;

  return (
    <View pointerEvents="box-none" style={[styles.root, { paddingBottom: bottomInset }]}>
      <View style={[styles.bar, { borderColor: glass.border, borderRadius: layout.tabBarRadius }]}>
        {solidGlass ? null : (
          <BlurView
            intensity={glass.blurIntensity * 1.3}
            tint={glass.tint}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.fillStrong }]} />
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={styles.sheen}
          pointerEvents="none"
        />

        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = tabOptionsFor(route.name);
          const Icon = meta.icon;

          return (
            <Pressable
              key={route.key}
              onPress={() => handlePress(route, focused)}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              style={styles.tab}
            >
              <View style={[styles.tabInner, focused && styles.tabInnerActive]}>
                <Icon size={22} strokeWidth={1.75} color={focused ? palette.primary : palette.textMuted} />
                {focused ? (
                  <Text style={[styles.tabLabel, { color: palette.emphasis }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {meta.label}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          tapHaptic();
          openAddExpense();
        }}
        accessibilityRole="button"
        accessibilityLabel="Add expense"
        style={({ pressed }) => [styles.addOrb, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
      >
        {solidGlass ? null : (
          <BlurView intensity={glass.blurIntensity} tint={glass.tint} style={StyleSheet.absoluteFill} />
        )}
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.matcha500, borderRadius: layout.addButtonSize / 2 }]}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={styles.orbSheen}
          pointerEvents="none"
        />
        <Plus size={28} strokeWidth={2.2} color={colors.matcha900} />
      </Pressable>
    </View>
  );
}

export const GlassTabBar = memo(GlassTabBarImpl);
export default GlassTabBar;

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: layout.tabBarSideMargin,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: layout.tabBarHeight,
    width: '100%',
    maxWidth: 520,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: colors.matcha900,
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  tab: {
    flex: 1,
    height: layout.tabBarHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: layout.tabBarItemRadius,
  },
  tabInnerActive: {
    backgroundColor: 'rgba(127,183,117,0.22)',
  },
  tabLabel: {
    fontSize: typeScale.caption.fontSize,
    fontWeight: '600',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  addOrb: {
    position: 'absolute',
    alignSelf: 'center',
    width: layout.addButtonSize,
    height: layout.addButtonSize,
    borderRadius: layout.addButtonSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    top: -layout.addButtonSize * 0.42,
    ...Platform.select({
      ios: {
        shadowColor: colors.matcha700,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  orbSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    borderRadius: layout.addButtonSize / 2,
  },
});