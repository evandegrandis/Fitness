import Foundation

enum MuscleGroup: String, Codable, CaseIterable, Identifiable, Comparable {
    case chest
    case shoulders
    case sidedelts = "side_delts"
    case frontdelts = "front_delts"
    case reardelts = "rear_delts"
    case triceps
    case biceps
    case forearms
    case lats
    case upperback = "upper_back"
    case quads
    case hamstrings
    case glutes
    case calves
    case abs
    case obliques

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .chest: return "Chest"
        case .shoulders: return "Shoulders"
        case .sidedelts: return "Side Delts"
        case .frontdelts: return "Front Delts"
        case .reardelts: return "Rear Delts"
        case .triceps: return "Triceps"
        case .biceps: return "Biceps"
        case .forearms: return "Forearms"
        case .lats: return "Lats"
        case .upperback: return "Upper Back"
        case .quads: return "Quads"
        case .hamstrings: return "Hamstrings"
        case .glutes: return "Glutes"
        case .calves: return "Calves"
        case .abs: return "Abs"
        case .obliques: return "Obliques"
        }
    }

    var icon: String {
        switch self {
        case .chest: return "figure.strengthtraining.traditional"
        case .shoulders, .sidedelts, .frontdelts, .reardelts: return "figure.arms.open"
        case .triceps: return "figure.boxing"
        case .biceps: return "figure.strengthtraining.functional"
        case .forearms: return "hand.raised.fill"
        case .lats, .upperback: return "figure.rowing"
        case .quads, .hamstrings, .glutes, .calves: return "figure.walk"
        case .abs, .obliques: return "figure.core.training"
        }
    }

    static func < (lhs: MuscleGroup, rhs: MuscleGroup) -> Bool {
        lhs.displayName < rhs.displayName
    }
}
