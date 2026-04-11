import Foundation

/// Canonical muscle taxonomy. No duplicated "shoulders" bucket — delts are always
/// split into side / front / rear. This is the single source of truth used across
/// weekly goals, exercise mappings, history, and progress.
enum MuscleGroup: String, Codable, CaseIterable, Identifiable, Comparable {
    case chest
    case upperback = "upper_back"
    case lats
    case biceps
    case triceps
    case sidedelts = "side_delts"
    case frontdelts = "front_delts"
    case reardelts = "rear_delts"
    case abs
    case obliques
    case forearms
    case quads
    case hamstrings
    case glutes
    case calves

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .chest: return "Pectoraux"
        case .upperback: return "Dos haut"
        case .lats: return "Grand dorsal"
        case .biceps: return "Biceps"
        case .triceps: return "Triceps"
        case .sidedelts: return "Deltoïde latéral"
        case .frontdelts: return "Deltoïde antérieur"
        case .reardelts: return "Deltoïde postérieur"
        case .abs: return "Abdos"
        case .obliques: return "Obliques"
        case .forearms: return "Avant-bras"
        case .quads: return "Quadriceps"
        case .hamstrings: return "Ischios"
        case .glutes: return "Fessiers"
        case .calves: return "Mollets"
        }
    }

    /// Short label used in compact chips where space is very tight.
    var shortName: String {
        switch self {
        case .chest: return "Pecs"
        case .upperback: return "Dos haut"
        case .lats: return "Dorsaux"
        case .biceps: return "Biceps"
        case .triceps: return "Triceps"
        case .sidedelts: return "Delt lat"
        case .frontdelts: return "Delt ant"
        case .reardelts: return "Delt post"
        case .abs: return "Abdos"
        case .obliques: return "Obliques"
        case .forearms: return "Av-bras"
        case .quads: return "Quads"
        case .hamstrings: return "Ischios"
        case .glutes: return "Fessiers"
        case .calves: return "Mollets"
        }
    }

    var icon: String {
        switch self {
        case .chest: return "figure.strengthtraining.traditional"
        case .sidedelts, .frontdelts, .reardelts: return "figure.arms.open"
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
