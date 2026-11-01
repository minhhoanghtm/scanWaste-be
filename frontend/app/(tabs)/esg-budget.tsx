import { useEffect, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useEcoSort } from "../../contexts/EcoSortContext";

const GREEN = "#0A9569";
const DARK = "#075B45";
const formatVND = (value: number) =>
    value.toLocaleString("vi-VN") + " đ";

export default function ESGBudgetScreen() {
    const { budget, spent, updateBudget } = useEcoSort();

    const [inputBudget, setInputBudget] = useState(String(budget));
    const [message, setMessage] = useState("");
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        setInputBudget(String(budget));
    }, [budget]);

    const remaining = Math.max(0, budget - spent);
    const progress = budget > 0 ? Math.min(spent / budget, 1) : 0;

    const handleUpdate = () => {
        const value = Number(inputBudget.trim());

        if (
            inputBudget.trim() === "" ||
            !Number.isFinite(value) ||
            value <= 0
        ) {
            setSuccess(false);
            setMessage("Vui lòng nhập ngân sách lớn hơn 0.");
            return;
        }

        if (!updateBudget(value)) {
            setSuccess(false);
            setMessage(
                "Ngân sách mới không được thấp hơn số tiền đã sử dụng."
            );
            return;
        }

        setSuccess(true);
        setMessage("Đã cập nhật ngân sách ESG thành công.");
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
                            Đối tác · ESG Management
                        </Text>
                    </View>

                    <View style={styles.avatar}>
                        <Text style={{ fontSize: 20 }}>🌿</Text>
                    </View>
                </View>

                <Text style={styles.eyebrow}>
                    QUẢN LÝ ĐỐI TÁC ESG
                </Text>

                <Text style={styles.title}>Ngân sách bền vững</Text>

                <Text style={styles.subtitle}>
                    Theo dõi và kiểm soát nguồn ngân sách dành cho các hoạt động xanh.
                </Text>

                <View style={styles.totalCard}>
                    <View style={styles.totalTop}>
                        <View>
                            <Text style={styles.totalLabel}>
                                TỔNG NGÂN SÁCH
                            </Text>
                            <Text style={styles.totalAmount}>
                                {formatVND(budget)}
                            </Text>
                        </View>

                        <View style={styles.totalIcon}>
                            <Text style={{ fontSize: 25 }}>💚</Text>
                        </View>
                    </View>

                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                { width: `${progress * 100}%` },
                            ]}
                        />
                    </View>

                    <View style={styles.progressLabels}>
                        <Text style={styles.progressText}>
                            Đã sử dụng {(progress * 100).toFixed(1)}%
                        </Text>
                        <Text style={styles.progressText}>
                            {formatVND(spent)}
                        </Text>
                    </View>
                </View>

                <View style={styles.metricRow}>
                    <View style={styles.metricCard}>
                        <View style={styles.metricIconSpent}>
                            <Text>↗</Text>
                        </View>

                        <Text style={styles.metricLabel}>
                            Đã sử dụng
                        </Text>

                        <Text style={styles.metricValue}>
                            {formatVND(spent)}
                        </Text>
                    </View>

                    <View style={styles.metricCard}>
                        <View style={styles.metricIconRemain}>
                            <Text>✓</Text>
                        </View>

                        <Text style={styles.metricLabel}>
                            Ngân sách còn
                        </Text>

                        <Text
                            style={[
                                styles.metricValue,
                                { color: GREEN },
                            ]}
                        >
                            {formatVND(remaining)}
                        </Text>
                    </View>
                </View>

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                        Cập nhật ngân sách
                    </Text>
                    <Text style={styles.sectionBadge}>
                        QUẢN TRỊ
                    </Text>
                </View>

                <View style={styles.formCard}>
                    <Text style={styles.inputLabel}>
                        Ngân sách mới (VND)
                    </Text>

                    <TextInput
                        value={inputBudget}
                        onChangeText={(value) => {
                            setInputBudget(value);
                            setMessage("");
                        }}
                        keyboardType="numeric"
                        placeholder="Ví dụ: 10000000"
                        placeholderTextColor="#A2B2AA"
                        style={styles.input}
                    />

                    <Text style={styles.helper}>
                        Giá trị phải lớn hơn 0 và không thấp hơn ngân sách đã sử dụng.
                    </Text>

                    <Pressable
                        style={styles.saveButton}
                        onPress={handleUpdate}
                    >
                        <Text style={styles.saveButtonText}>
                            ✓   Lưu thay đổi
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
                            <Text style={styles.messageText}>
                                {message}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                        Phân bổ hoạt động ESG
                    </Text>
                    <Text style={styles.sectionHint}>Minh họa</Text>
                </View>

                <View style={styles.allocationCard}>
                    <View style={styles.allocationRow}>
                        <View
                            style={[
                                styles.dot,
                                { backgroundColor: "#0A9569" },
                            ]}
                        />
                        <Text style={styles.allocationName}>
                            Thu gom & tái chế
                        </Text>
                        <Text style={styles.allocationValue}>40%</Text>
                    </View>

                    <View style={styles.allocationTrack}>
                        <View
                            style={[
                                styles.allocationFill,
                                {
                                    width: "40%",
                                    backgroundColor: "#0A9569",
                                },
                            ]}
                        />
                    </View>

                    <View style={styles.allocationRow}>
                        <View
                            style={[
                                styles.dot,
                                { backgroundColor: "#69BFA0" },
                            ]}
                        />
                        <Text style={styles.allocationName}>
                            Truyền thông xanh
                        </Text>
                        <Text style={styles.allocationValue}>35%</Text>
                    </View>

                    <View style={styles.allocationTrack}>
                        <View
                            style={[
                                styles.allocationFill,
                                {
                                    width: "35%",
                                    backgroundColor: "#69BFA0",
                                },
                            ]}
                        />
                    </View>

                    <View style={styles.allocationRow}>
                        <View
                            style={[
                                styles.dot,
                                { backgroundColor: "#E8B75A" },
                            ]}
                        />
                        <Text style={styles.allocationName}>
                            Quà tặng & khuyến khích
                        </Text>
                        <Text style={styles.allocationValue}>25%</Text>
                    </View>

                    <View style={styles.allocationTrack}>
                        <View
                            style={[
                                styles.allocationFill,
                                {
                                    width: "25%",
                                    backgroundColor: "#E8B75A",
                                },
                            ]}
                        />
                    </View>

                    <Text style={styles.allocationNote}>
                        Tỷ lệ phân bổ là dữ liệu minh họa giao diện, chưa được liên kết với giao dịch thực tế.
                    </Text>
                </View>

                <Text style={styles.footer}>
                    EcoSort AI · ESG Partner Dashboard
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#F5FBF8",
    },
    content: {
        padding: 18,
        paddingBottom: 36,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 25,
    },
    brand: {
        color: DARK,
        fontSize: 21,
        fontWeight: "900",
    },
    brandAI: {
        color: GREEN,
    },
    headerCaption: {
        color: "#82968C",
        fontSize: 10,
        marginTop: 3,
    },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#DDF4E9",
        alignItems: "center",
        justifyContent: "center",
    },
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
        color: "#7D9187",
        fontSize: 11,
        lineHeight: 17,
        marginTop: 6,
        marginBottom: 18,
    },
    totalCard: {
        backgroundColor: DARK,
        borderRadius: 21,
        padding: 19,
        marginBottom: 14,
    },
    totalTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    totalLabel: {
        color: "#BCEBD7",
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 0.8,
    },
    totalAmount: {
        color: "#FFFFFF",
        fontSize: 25,
        fontWeight: "900",
        marginTop: 7,
    },
    totalIcon: {
        width: 49,
        height: 49,
        borderRadius: 25,
        backgroundColor: "#14775A",
        alignItems: "center",
        justifyContent: "center",
    },
    progressTrack: {
        height: 9,
        backgroundColor: "#286F59",
        borderRadius: 8,
        marginTop: 20,
        overflow: "hidden",
    },
    progressFill: {
        height: 9,
        backgroundColor: "#5BE0A8",
        borderRadius: 8,
    },
    progressLabels: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 9,
    },
    progressText: {
        color: "#D0EFE1",
        fontSize: 9,
        fontWeight: "600",
    },
    metricRow: {
        flexDirection: "row",
        gap: 11,
        marginBottom: 24,
    },
    metricCard: {
        flex: 1,
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: "#E5F0E9",
    },
    metricIconSpent: {
        width: 28,
        height: 28,
        borderRadius: 9,
        backgroundColor: "#FFF1DF",
        alignItems: "center",
        justifyContent: "center",
    },
    metricIconRemain: {
        width: 28,
        height: 28,
        borderRadius: 9,
        backgroundColor: "#DFF5E9",
        alignItems: "center",
        justifyContent: "center",
    },
    metricLabel: {
        color: "#81948A",
        fontSize: 10,
        marginTop: 10,
    },
    metricValue: {
        color: "#244A3B",
        fontSize: 13,
        fontWeight: "900",
        marginTop: 5,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 11,
    },
    sectionTitle: {
        color: "#1B4236",
        fontSize: 15,
        fontWeight: "900",
    },
    sectionBadge: {
        color: GREEN,
        backgroundColor: "#DFF5E9",
        overflow: "hidden",
        borderRadius: 7,
        paddingHorizontal: 8,
        paddingVertical: 4,
        fontSize: 8,
        fontWeight: "900",
    },
    sectionHint: {
        color: "#82968C",
        fontSize: 10,
    },
    formCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 17,
        padding: 16,
        borderWidth: 1,
        borderColor: "#E5F0E9",
        marginBottom: 24,
    },
    inputLabel: {
        color: "#466457",
        fontSize: 11,
        fontWeight: "800",
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: "#DCEAE2",
        borderRadius: 11,
        paddingHorizontal: 13,
        paddingVertical: 12,
        color: "#244A3B",
        backgroundColor: "#FAFDFB",
        fontSize: 13,
    },
    helper: {
        color: "#94A69C",
        fontSize: 9,
        lineHeight: 14,
        marginTop: 7,
    },
    saveButton: {
        backgroundColor: GREEN,
        borderRadius: 12,
        padding: 14,
        alignItems: "center",
        marginTop: 14,
    },
    saveButtonText: {
        color: "#FFFFFF",
        fontSize: 12,
        fontWeight: "900",
    },
    messageBox: {
        padding: 11,
        borderRadius: 10,
        marginTop: 12,
    },
    messageSuccess: {
        backgroundColor: "#DDF5E8",
    },
    messageError: {
        backgroundColor: "#FFF0E8",
    },
    messageText: {
        color: "#245642",
        fontSize: 10,
        fontWeight: "700",
    },
    allocationCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 17,
        padding: 16,
        borderWidth: 1,
        borderColor: "#E5F0E9",
    },
    allocationRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 9,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    allocationName: {
        flex: 1,
        color: "#526F61",
        fontSize: 10,
    },
    allocationValue: {
        color: "#315A48",
        fontSize: 10,
        fontWeight: "900",
    },
    allocationTrack: {
        height: 6,
        backgroundColor: "#EEF4F0",
        borderRadius: 6,
        marginTop: 7,
        marginBottom: 7,
        overflow: "hidden",
    },
    allocationFill: {
        height: 6,
        borderRadius: 6,
    },
    allocationNote: {
        color: "#9AA9A1",
        fontSize: 9,
        lineHeight: 14,
        marginTop: 10,
    },
    footer: {
        textAlign: "center",
        color: "#A0B0A7",
        fontSize: 9,
        marginTop: 18,
    },
});