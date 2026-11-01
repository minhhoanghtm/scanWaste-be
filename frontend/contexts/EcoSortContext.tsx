
import React, {
    createContext,
    ReactNode,
    useContext,
    useState,
} from "react";

export type Reward = {
    id: string;
    name: string;
    category: string;
    points: number;
    stock: number;
};

type EcoSortContextType = {
    points: number;
    rewards: Reward[];
    redeemReward: (id: string) => { success: boolean; message: string };
    budget: number;
    spent: number;
    updateBudget: (value: number) => boolean;
};

const initialRewards: Reward[] = [
    {
        id: "R001",
        name: "Voucher The Coffee House",
        category: "F&B",
        points: 100,
        stock: 10,
    },
    {
        id: "R002",
        name: "Voucher Highlands Coffee",
        category: "F&B",
        points: 150,
        stock: 8,
    },
    {
        id: "R003",
        name: "Túi thân thiện môi trường",
        category: "Eco-Products",
        points: 200,
        stock: 5,
    },
    {
        id: "R004",
        name: "Ủng hộ quỹ môi trường",
        category: "Donation",
        points: 50,
        stock: 20,
    },
];

const EcoSortContext = createContext<EcoSortContextType | undefined>(
    undefined
);

export function EcoSortProvider({ children }: { children: ReactNode }) {
    const [points, setPoints] = useState(350);
    const [rewards, setRewards] = useState<Reward[]>(initialRewards);
    const [budget, setBudget] = useState(10000000);
    const [spent, setSpent] = useState(3500000);

    const redeemReward = (id: string) => {
        const reward = rewards.find((item) => item.id === id);

        if (!reward) {
            return { success: false, message: "Không tìm thấy quà tặng." };
        }

        if (reward.stock <= 0) {
            return { success: false, message: "Quà tặng đã hết." };
        }

        if (points < reward.points) {
            return { success: false, message: "Bạn không đủ EcoPoints." };
        }

        setPoints((current) => current - reward.points);

        setRewards((current) =>
            current.map((item) =>
                item.id === id ? { ...item, stock: item.stock - 1 } : item
            )
        );

        return {
            success: true,
            message: `Đổi "${reward.name}" thành công!`,
        };
    };

    const updateBudget = (value: number) => {
        if (!Number.isFinite(value) || value < spent) {
            return false;
        }

        setBudget(value);
        return true;
    };

    return (
        <EcoSortContext.Provider
            value={{
                points,
                rewards,
                redeemReward,
                budget,
                spent,
                updateBudget,
            }}
        >
            {children}
        </EcoSortContext.Provider>
    );
}

export function useEcoSort() {
    const context = useContext(EcoSortContext);

    if (!context) {
        throw new Error("useEcoSort phải được dùng bên trong EcoSortProvider");
    }

    return context;
}
