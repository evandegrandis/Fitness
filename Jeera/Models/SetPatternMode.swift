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
