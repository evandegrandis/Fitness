import Foundation

enum SetPatternMode: String, Codable, CaseIterable, Identifiable {
    case straight
    case topSetBackoff = "top_set_backoff"
    case ramping
    case bodyweight
    case weightedBodyweight = "weighted_bodyweight"
    case assistedBodyweight = "assisted_bodyweight"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .straight: return "Straight Sets"
        case .topSetBackoff: return "Top Set + Backoffs"
        case .ramping: return "Ramping"
        case .bodyweight: return "Bodyweight"
        case .weightedBodyweight: return "Weighted Bodyweight"
        case .assistedBodyweight: return "Assisted Bodyweight"
        }
    }

    var shortName: String {
        switch self {
        case .straight: return "Straight"
        case .topSetBackoff: return "Top + Back"
        case .ramping: return "Ramp"
        case .bodyweight: return "BW"
        case .weightedBodyweight: return "Weighted BW"
        case .assistedBodyweight: return "Assisted"
        }
    }

    var usesWeight: Bool {
        switch self {
        case .bodyweight: return false
        default: return true
        }
    }
}

/// Per-exercise systemic fatigue class used by the progression engine.
/// Governs the expected rep drop across successive working sets at the
/// same load, plus the strictness of load-promotion rules.
enum FatigueClass: String, Codable, CaseIterable, Identifiable {
    /// Heavy compound / weighted BW — ~2 rep drop, strict promotion.
    case heavy = "H"
    /// Stable machine compound — ~1.5 rep drop, normal promotion.
    case medium = "M"
    /// Isolation / forearms / abs — ~1 rep drop, normal promotion.
    case light = "L"

    var id: String { rawValue }

    /// Expected rep drop on the next set at the same load, with no other
    /// modifiers. Matches algo §3.2.
    var baseRepDrop: Double {
        switch self {
        case .heavy: return 2.0
        case .medium: return 1.5
        case .light: return 1.0
        }
    }

    /// Promotion rule: H uses strict (2 of last 3 exposures), M/L use normal
    /// (1 of last 2). Matches algo §6.3.
    var usesStrictPromotion: Bool { self == .heavy }
}

enum SetType: String, Codable, CaseIterable, Identifiable {
    case warmup
    case work
    case backoff
    case topSet = "top_set"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .warmup: return "Warmup"
        case .work: return "Work"
        case .backoff: return "Backoff"
        case .topSet: return "Top Set"
        }
    }

    var shortLabel: String {
        switch self {
        case .warmup: return "W"
        case .work: return ""
        case .backoff: return "B"
        case .topSet: return "T"
        }
    }
}
