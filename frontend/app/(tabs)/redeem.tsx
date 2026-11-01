import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useEcoSort } from "../../contexts/EcoSortContext";

const GREEN = "#0A9569";
const DARK = "#075B45";
const formatPoints = (value: number) => value.toLocaleString("vi-VN");

export default function RedeemScreen() {
    const router = useRouter();
    const { rewardId } = useLocalSearchParams<{ rewardId?: string }>();
    const { points, rewards, redeemReward } = useEcoSort();

    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);
    const [busy, setBusy] = useState(false);

    const selectedReward = rewards.find((item) => item.id === rewardId);

    const canRedeem =
        !!selectedReward &&
        points >= selectedReward.points &&
        selectedReward.stock > 0;

    const handleRedeem = () => {
        if (busy || !selectedReward) return;

        if (selectedReward.stock <= 0) {
            setSuccess(false);
            setMessage("Quà tặng đã hết. Mời bạn chọn phần quà khác.");
            return;
        }

        if (points < selectedReward.points) {
            setSuccess(false);
            setMessage("Bạn chưa đủ EcoPoints để đổi phần quà này.");
            return;
        }

        setBusy(true);

        try {
            const result = redeemReward(selectedReward.id);
            setSuccess(result.success);
            setMessage(result.message);
        } catch (error) {
            setSuccess(false);
            setMessage("Có lỗi xảy ra khi đổi quà. Vui lòng thử lại.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={styles.screen}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Pressable
                        onPress={() => router.back()}
                        style={styles.backButton}
                    >
                        <Text style={styles.backText}>‹</Text>
                    </Pressable>

                    <View style={{ flex: 1 }}>
                        <Text style={styles.brand}>
                            EcoSort <Text style={styles.brandAI}>AI</Text>
                        </Text>
                        <Text style={styles.headerCaption}>
                            Đổi quà xanh · Sống bền vững
                        </Text>
                    </View>

                    <Text style={styles.headerIcon}>🎁</Text>
                </View>

                <Text style={styles.eyebrow}>ĐẶC QUYỀN CỦA BẠN</Text>
                <Text style={styles.title}>Xác nhận đổi quà</Text>
                <Text style={styles.subtitle}>
                    Dùng điểm Eco tích lũy để nhận ưu đãi yêu thích.
                </Text>

                <View style={styles.balanceCard}>
                    <View>
                        <Text style={styles.balanceLabel}>SỐ DƯ HIỆN TẠI</Text>
                        <Text style={styles.balance}>
                            {formatPoints(points)}{" "}
                            <Text style={styles.balanceUnit}>Điểm Eco</Text>
                        </Text>
                    </View>

                    <View style={styles.balanceIcon}>
                        <Text style={{ fontSize: 25 }}>♻️</Text>
                    </View>

                    <Text style={styles.balanceNote}>
                        Điểm Eco được cập nhật ngay sau khi đổi quà thành công.
                    </Text>
                </View>

                {selectedReward ? (
                    <>
                        <Text style={styles.sectionTitle}>
                            Quà tặng bạn đã chọn
                        </Text>

                        <View style={styles.rewardCard}>
                            <View style={styles.rewardImage}>
                                <Text style={styles.rewardEmoji}>
                                    {selectedReward.category === "F&B"
                                        ? "☕"
                                        : selectedReward.category === "Donation"
                                            ? "🌱"
                                            : "👜"}
                                </Text>
                            </View>

                            <View style={styles.rewardDetails}>
                                <Text style={styles.category}>
                                    {selectedReward.category}
                                </Text>
                                <Text style={styles.rewardName}>
                                    {selectedReward.name}
                                </Text>
                                <Text style={styles.rewardStock}>
                                    Còn {selectedReward.stock} phần quà
                                </Text>
                                <Text style={styles.rewardCost}>
                                    {formatPoints(selectedReward.points)} điểm Eco
                                </Text>
                            </View>
                        </View>

                        <View style={styles.summaryCard}>
                            <Text style={styles.sectionTitle}>
                                Thông tin đổi quà
                            </Text>

                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Điểm hiện có</Text>
                                <Text style={styles.summaryValue}>
                                    {formatPoints(points)}
                                </Text>
                            </View>

                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Điểm cần dùng</Text>
                                <Text style={styles.summaryValue}>
                                    −{formatPoints(selectedReward.points)}
                                </Text>
                            </View>

                            <View style={styles.summaryDivider} />

                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryFinalLabel}>
                                    Số dư sau đổi
                                </Text>
                                <Text style={styles.summaryFinalValue}>
                                    {formatPoints(
                                        Math.max(0, points - selectedReward.points)
                                    )}{" "}
                                    điểm
                                </Text>
                            </View>
                        </View>

                        <Pressable
                            onPress={handleRedeem}
                            disabled={busy || success || !canRedeem}
                            style={[
                                styles.confirmButton,
                                (!canRedeem || busy || success) &&
                                styles.buttonDisabled,
                            ]}
                        >
                            <Text style={styles.confirmText}>
                                {success
                                    ? "Đã đổi quà thành công"
                                    : busy
                                        ? "Đang xử lý..."
                                        : canRedeem
                                            ? "✓  Xác nhận đổi quà"
                                            : "Chưa đủ điều kiện đổi"}
                            </Text>
                        </Pressable>

                        {message !== "" && (
                            <View
                                style={[
                                    styles.messageBox,
                                    success
                                        ? styles.messageSuccess
                                        : styles.messageError,
                                ]}
                            >
                                <Text style={styles.messageIcon}>
                                    {success ? "✓" : "!"}
                                </Text>
                                <Text style={styles.messageText}>{message}</Text>
                            </View>
                        )}
                    </>
                ) : (
                    <View style={styles.emptyCard}>
                        <Text style={{ fontSize: 32 }}>🎁</Text>
                        <Text style={styles.emptyTitle}>
                            Chưa chọn quà tặng
                        </Text>
                        <Text style={styles.emptyText}>
                            Quay lại cửa hàng và chọn phần quà bạn yêu thích.
                        </Text>

                        <Pressable
                            onPress={() => router.back()}
                            style={styles.confirmButton}
                        >
                            <Text style={styles.confirmText}>
                                Quay lại cửa hàng
                            </Text>
                        </Pressable>
                    </View>
                )}

                <View style={styles.notice}>
                    <Text style={styles.noticeIcon}>ⓘ</Text>
                    <Text style={styles.noticeText}>
                        Vui lòng kiểm tra thông tin quà tặng trước khi xác nhận.
                        Mỗi lượt đổi sẽ trừ điểm Eco tương ứng.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#F5FBF8" },
    content: { padding: 18, paddingBottom: 36 },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 26,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#E5F5ED",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    backText: { color: DARK, fontSize: 29, lineHeight: 31 },
    brand: { color: DARK, fontSize: 18, fontWeight: "900" },
    brandAI: { color: GREEN },
    headerCaption: {
        color: "#80968B",
        fontSize: 10,
        marginTop: 2,
    },
    headerIcon: { fontSize: 25 },
    eyebrow: {
        color: GREEN,
        fontSize: 10,
        fontWeight: "900",
        letterSpacing: 1,
    },
    title: {
        color: "#183F33",
        fontSize: 25,
        fontWeight: "900",
        marginTop: 5,
    },
    subtitle: {
        color: "#80968B",
        fontSize: 12,
        marginTop: 6,
        marginBottom: 19,
    },
    balanceCard: {
        backgroundColor: DARK,
        borderRadius: 21,
        padding: 19,
        marginBottom: 25,
    },
    balanceLabel: {
        color: "#BCEBD7",
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 0.8,
    },
    balance: {
        color: "#FFFFFF",
        fontSize: 29,
        fontWeight: "900",
        marginTop: 7,
    },
    balanceUnit: {
        color: "#D1F2E4",
        fontSize: 12,
        fontWeight: "600",
    },
    balanceIcon: {
        position: "absolute",
        right: 18,
        top: 18,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "#14775A",
        alignItems: "center",
        justifyContent: "center",
    },
    balanceNote: {
        color: "#C9EBDD",
        fontSize: 10,
        marginTop: 13,
        lineHeight: 15,
    },
    sectionTitle: {
        color: "#1B4236",
        fontSize: 15,
        fontWeight: "900",
        marginBottom: 12,
    },
    rewardCard: {
        flexDirection: "row",
        backgroundColor: "#FFFFFF",
        borderRadius: 17,
        padding: 12,
        borderWidth: 1,
        borderColor: "#E3EFE8",
        marginBottom: 18,
    },
    rewardImage: {
        width: 90,
        height: 100,
        borderRadius: 13,
        backgroundColor: "#E5F6EC",
        alignItems: "center",
        justifyContent: "center",
    },
    rewardEmoji: { fontSize: 39 },
    rewardDetails: {
        flex: 1,
        paddingLeft: 13,
        justifyContent: "center",
    },
    category: {
        color: GREEN,
        fontSize: 9,
        fontWeight: "900",
        textTransform: "uppercase",
    },
    rewardName: {
        color: "#1D4035",
        fontSize: 14,
        fontWeight: "800",
        marginTop: 5,
        lineHeight: 19,
    },
    rewardStock: {
        color: "#8A9B92",
        fontSize: 10,
        marginTop: 5,
    },
    rewardCost: {
        color: GREEN,
        fontSize: 13,
        fontWeight: "900",
        marginTop: 7,
    },
    summaryCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 17,
        padding: 16,
        borderWidth: 1,
        borderColor: "#E3EFE8",
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 11,
    },
    summaryLabel: { color: "#82948B", fontSize: 12 },
    summaryValue: {
        color: "#35594B",
        fontSize: 12,
        fontWeight: "700",
    },
    summaryDivider: {
        height: 1,
        backgroundColor: "#E8F0EB",
        marginTop: 14,
    },
    summaryFinalLabel: {
        color: "#244B3C",
        fontSize: 12,
        fontWeight: "800",
    },
    summaryFinalValue: {
        color: GREEN,
        fontSize: 13,
        fontWeight: "900",
    },
    confirmButton: {
        backgroundColor: GREEN,
        borderRadius: 14,
        padding: 15,
        alignItems: "center",
        marginTop: 4,
    },
    buttonDisabled: { backgroundColor: "#A6B8AE" },
    confirmText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "900",
    },
    messageBox: {
        flexDirection: "row",
        alignItems: "center",
        padding: 13,
        borderRadius: 12,
        marginTop: 13,
    },
    messageSuccess: { backgroundColor: "#DDF5E8" },
    messageError: { backgroundColor: "#FFF0E8" },
    messageIcon: {
        color: GREEN,
        fontSize: 18,
        fontWeight: "900",
        marginRight: 9,
    },
    messageText: {
        flex: 1,
        color: "#245642",
        fontSize: 11,
        fontWeight: "700",
        lineHeight: 16,
    },
    emptyCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 17,
        padding: 24,
        alignItems: "center",
    },
    emptyTitle: {
        color: "#1B4236",
        fontSize: 16,
        fontWeight: "900",
        marginTop: 10,
    },
    emptyText: {
        color: "#82948B",
        fontSize: 11,
        textAlign: "center",
        marginTop: 6,
        marginBottom: 18,
    },
    notice: {
        flexDirection: "row",
        backgroundColor: "#EAF5F0",
        borderRadius: 12,
        padding: 12,
        marginTop: 17,
    },
    noticeIcon: {
        color: GREEN,
        fontSize: 16,
        fontWeight: "900",
        marginRight: 8,
    },
    noticeText: {
        flex: 1,
        color: "#688276",
        fontSize: 10,
        lineHeight: 15,
    },
});