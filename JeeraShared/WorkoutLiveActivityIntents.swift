import AppIntents
import Foundation

/// Notifications emitted when the user taps a button on the Live Activity.
/// The app observes these in `WorkoutViewModel` and performs the real work.
///
/// LiveActivityIntents always execute in the APP's process (iOS foregrounds the
/// app if it's suspended), so a NotificationCenter post from `perform()` is a
/// safe, synchronous way to hand off to the view model without fighting a
/// cross-process bridge.
public extension Notification.Name {
    /// Posted when the user taps "Valider" on the lock-screen Live Activity.
    static let jeeraValidateNextSet = Notification.Name("jeeraValidateNextSet")

    /// Posted when the user taps "Passer" (skip rest).
    static let jeeraSkipRestFromLiveActivity = Notification.Name("jeeraSkipRestFromLiveActivity")
    static let jeeraNextExerciseFromLiveActivity = Notification.Name("jeeraNextExerciseFromLiveActivity")
    static let jeeraIncreaseWeightFromLiveActivity = Notification.Name("jeeraIncreaseWeightFromLiveActivity")
    static let jeeraDecreaseWeightFromLiveActivity = Notification.Name("jeeraDecreaseWeightFromLiveActivity")
    static let jeeraIncreaseRepsFromLiveActivity = Notification.Name("jeeraIncreaseRepsFromLiveActivity")
    static let jeeraDecreaseRepsFromLiveActivity = Notification.Name("jeeraDecreaseRepsFromLiveActivity")
}

/// "Suivant" — move Live Activity focus to the next exercise context.
@available(iOS 17.0, *)
public struct NextExerciseIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Suivant"
    public static var description = IntentDescription("Passe à l'exercice suivant")
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .jeeraNextExerciseFromLiveActivity, object: nil)
        }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct IncreaseWeightIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "+Kg"
    public static var isDiscoverable: Bool = false
    public init() {}
    public func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .jeeraIncreaseWeightFromLiveActivity, object: nil)
        }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct DecreaseWeightIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "-Kg"
    public static var isDiscoverable: Bool = false
    public init() {}
    public func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .jeeraDecreaseWeightFromLiveActivity, object: nil)
        }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct IncreaseRepsIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "+Rep"
    public static var isDiscoverable: Bool = false
    public init() {}
    public func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .jeeraIncreaseRepsFromLiveActivity, object: nil)
        }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct DecreaseRepsIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "-Rep"
    public static var isDiscoverable: Bool = false
    public init() {}
    public func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .jeeraDecreaseRepsFromLiveActivity, object: nil)
        }
        return .result()
    }
}

/// "Valider" — log the currently-suggested set from the lock screen.
/// Concrete work lives in the app (SwiftData, VM state); this intent just
/// forwards the tap via NotificationCenter once the app is foregrounded.
@available(iOS 17.0, *)
public struct ValidateNextSetIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Valider"
    public static var description = IntentDescription("Valide le set suggéré")
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .jeeraValidateNextSet, object: nil)
        }
        return .result()
    }
}

/// "Passer" — skip the current rest timer from the lock screen.
@available(iOS 17.0, *)
public struct SkipRestIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Passer"
    public static var description = IntentDescription("Passe le repos")
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .jeeraSkipRestFromLiveActivity, object: nil)
        }
        return .result()
    }
}
