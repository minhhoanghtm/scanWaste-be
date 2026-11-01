import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Reward, useEcoSort } from "../../contexts/EcoSortContext";

const GREEN = "#087F5B";
const DARK = "#075B45";
const formatPoints = (value: number) => value.toLocaleString("vi-VN");

const categories = ["Tất cả", "Voucher", "Sản phẩm xanh", "Quyên góp"];

function categoryMatches(reward: Reward, selected: string) {
  if (selected === "Tất cả") return true;
  if (selected === "Voucher") return reward.category === "F&B";
  if (selected === "Sản phẩm xanh") return reward.category === "Eco-Products";
  return reward.category === "Donation";
}

export default function StoreScreen() {
  const router = useRouter();
  const { points, rewards } = useEcoSort();
  const [selectedCategory, setSelectedCategory] = useState("Tất cả");

  const filteredRewards = useMemo(
    () => rewards.filter((reward) => categoryMatches(reward, selectedCategory)),
    [rewards, selectedCategory]
  );

  const renderReward = (item: Reward, index: number) => {
    const canRedeem = points >= item.points && item.stock > 0;
    const icons = ["☕", "🥤", "👜", "🌱"];

    return (
      <View key={item.id} style={styles.rewardCard}>
        <View style={[styles.rewardArt, index % 2 === 0 ? styles.artMint : styles.artCream]}>
          <Text style={styles.rewardEmoji}>{icons[index % icons.length]}</Text>
          <View style={styles.partnerTag}>
            <Text style={styles.partnerTagText}>
              {item.category === "F&B" ? "ĐỐI TÁC" : "SỐNG XANH"}
            </Text>
          </View>
        </View>

        <View style={styles.rewardInfo}>
          <Text style={styles.rewardName}>{item.name}</Text>
          <Text style={styles.rewardDescription}>
            {item.category === "F&B"
              ? "Ưu đãi dành cho thành viên EcoSort"
              : item.category === "Donation"
                ? "Chung tay vì môi trường xanh"
                : "Sản phẩm thân thiện với môi trường"}
          </Text>

          <View style={styles.rewardBottom}>
            <View>
              <Text style={styles.cost}>
                {formatPoints(item.points)}{" "}
                <Text style={styles.costUnit}>điểm</Text>
              </Text>
              <Text style={styles.stock}>Còn {item.stock} phần quà</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              style={[
                styles.exchangeButton,
                !canRedeem && styles.exchangeDisabled,
              ]}
              onPress={() =>
                router.push({
                  pathname: "/redeem",
                  params: { rewardId: item.id },
                })
              }
            >
              <Text style={styles.exchangeText}>
                {item.stock === 0
                  ? "Hết quà"
                  : canRedeem
                    ? "Đổi quà"
                    : "Chi tiết"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>
              EcoSort <Text style={styles.brandAI}>AI</Text>
            </Text>
            <Text style={styles.headerCaption}>
              Đổi điểm xanh · Nhận quà hay
            </Text>
          </View>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>🌿</Text>
          </View>
        </View>

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.eyebrow}>ĐẶC QUYỀN THÀNH VIÊN</Text>
            <Text style={styles.title}>Đổi quà & ưu đãi</Text>
            <Text style={styles.subtitle}>
              Gieo hành động xanh, nhận ngàn ưu đãi.
            </Text>
          </View>
          <Text style={styles.titleIcon}>🎁</Text>
        </View>

        <View style={styles.pointsHero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>ĐIỂM ECO CỦA BẠN</Text>
              <Text style={styles.heroPoints}>
                {formatPoints(points)}{" "}
                <Text style={styles.heroUnit}>Điểm Eco</Text>
              </Text>
            </View>

            <View style={styles.leafCircle}>
              <Text style={styles.leafIcon}>♻</Text>
            </View>
          </View>

          <Text style={styles.heroNote}>
            Mỗi hành động nhỏ hôm nay tạo nên thay đổi lớn ngày mai.
          </Text>

          <View style={styles.heroFooter}>
            <Text style={styles.heroFooterText}>
              🌱 Tiếp tục phân loại rác để tích thêm điểm nhé!
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Danh mục quà tặng</Text>
          <Text style={styles.sectionHint}>
            {filteredRewards.length} ưu đãi
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {categories.map((category) => {
            const active = selectedCategory === category;

            return (
              <Pressable
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[
                  styles.categoryChip,
                  active && styles.categoryChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    active && styles.categoryTextActive,
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.promoBanner}>
          <View style={styles.promoTextWrap}>
            <Text style={styles.promoEyebrow}>SỐNG XANH MỖI NGÀY</Text>
            <Text style={styles.promoTitle}>
              Ưu đãi dành riêng cho bạn
            </Text>
            <Text style={styles.promoSubtitle}>
              Đổi EcoPoints để nhận quà từ các đối tác xanh.
            </Text>
          </View>
          <Text style={styles.promoEmoji}>🌎</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quà tặng dành cho bạn</Text>
          <Text style={styles.sectionHint}>Mới nhất</Text>
        </View>

        {filteredRewards.length > 0 ? (
          filteredRewards.map((item, index) =>
            renderReward(item, index)
          )
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎁</Text>
            <Text style={styles.emptyText}>
              Chưa có quà trong danh mục này.
            </Text>
          </View>
        )}

        <Text style={styles.bottomNote}>
          EcoSort AI · Cùng bạn xây dựng tương lai bền vững
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5FBF8" },
  content: { padding: 18, paddingBottom: 36 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  brand: {
    color: DARK,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  brandAI: { color: "#14A875" },
  headerCaption: { color: "#789187", fontSize: 11, marginTop: 2 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#DDF4E9",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 22 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  eyebrow: {
    color: "#16966C",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  title: {
    color: "#173D32",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 5,
  },
  subtitle: { color: "#789187", fontSize: 12, marginTop: 5 },
  titleIcon: { fontSize: 36 },
  pointsHero: {
    backgroundColor: DARK,
    borderRadius: 22,
    padding: 20,
    marginBottom: 25,
    overflow: "hidden",
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLabel: {
    color: "#BDEBD7",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroPoints: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 7,
  },
  heroUnit: {
    color: "#C5EBDD",
    fontSize: 13,
    fontWeight: "600",
  },
  leafCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#187C60",
    alignItems: "center",
    justifyContent: "center",
  },
  leafIcon: { color: "#C8F5DF", fontSize: 27 },
  heroNote: {
    color: "#D2F0E3",
    fontSize: 11,
    marginTop: 13,
    lineHeight: 17,
  },
  heroFooter: {
    backgroundColor: "#126C52",
    borderRadius: 12,
    padding: 10,
    marginTop: 16,
  },
  heroFooterText: {
    color: "#E3FFF1",
    fontSize: 10,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#183F33",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionHint: {
    color: "#14966C",
    fontSize: 11,
    fontWeight: "700",
  },
  categoryList: { gap: 8, paddingBottom: 18 },
  categoryChip: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1EEE8",
  },
  categoryChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  categoryText: {
    color: "#648075",
    fontSize: 11,
    fontWeight: "700",
  },
  categoryTextActive: { color: "#FFFFFF" },
  promoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#DDF5E9",
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  promoTextWrap: { flex: 1, paddingRight: 8 },
  promoEyebrow: {
    color: "#15936A",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  promoTitle: {
    color: "#14583F",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5,
  },
  promoSubtitle: {
    color: "#54786A",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  promoEmoji: { fontSize: 39 },
  rewardCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 11,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E6F0EB",
  },
  rewardArt: {
    width: 94,
    minHeight: 112,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  artMint: { backgroundColor: "#E3F6EC" },
  artCream: { backgroundColor: "#F8F1DF" },
  rewardEmoji: { fontSize: 36 },
  partnerTag: {
    position: "absolute",
    bottom: 7,
    backgroundColor: "#FFFFFF",
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  partnerTagText: {
    color: "#16815F",
    fontSize: 7,
    fontWeight: "900",
  },
  rewardInfo: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: "center",
  },
  rewardName: {
    color: "#1D4035",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  rewardDescription: {
    color: "#82958C",
    fontSize: 9,
    marginTop: 4,
    lineHeight: 13,
  },
  rewardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  cost: { color: "#11936A", fontSize: 14, fontWeight: "900" },
  costUnit: { color: "#729084", fontSize: 9, fontWeight: "600" },
  stock: { color: "#9AA9A2", fontSize: 9, marginTop: 3 },
  exchangeButton: {
    backgroundColor: "#0E9F6E",
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  exchangeDisabled: { backgroundColor: "#A7B7AF" },
  exchangeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  emptyState: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
  },
  emptyEmoji: { fontSize: 30 },
  emptyText: { color: "#789187", marginTop: 8, fontSize: 12 },
  bottomNote: {
    textAlign: "center",
    color: "#9AAEA4",
    fontSize: 10,
    marginTop: 15,
  },
});