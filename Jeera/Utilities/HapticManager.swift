import UIKit

enum HapticManager {
    static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        UINotificationFeedbackGenerator().notificationOccurred(type)
    }

    static func logSet() {
        impact(.heavy)
    }

    static func deleteSet() {
        notification(.warning)
    }

    static func reorder() {
        impact(.light)
    }

    static func tap() {
        impact(.light)
    }
}
