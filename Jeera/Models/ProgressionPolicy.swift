import Foundation

enum ProgressionPolicy: String, CaseIterable, Identifiable, Codable {
    /// Standard double-progression: maintain load until reps reach repMax, then promote.
    case generic
    /// On plateau, immediately attempt an overreach at +1 increment / low reps.
    /// Good for exercises where stalling is best broken by a heavier stimulus (e.g. pull-ups).
    case overreachJump
    /// Set 2 is a deliberate test at +1 increment; if reps ≥ repMin, that load becomes
    /// the new anchor next session. Useful when you want to compress the promotion cycle.
    case testThenPromote
    /// Suggestions never exceed voluntaryRepCap reps. Useful for isolation exercises
    /// where you deliberately cap reps to keep tension/technique (e.g. crunches at ×10).
    case voluntaryCap

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .generic: return "Standard"
        case .overreachJump: return "Saut overreach"
        case .testThenPromote: return "Test puis promotion"
        case .voluntaryCap: return "Cap de reps"
        }
    }

    var description: String {
        switch self {
        case .generic: return "Double progression classique"
        case .overreachJump: return "Plateau → surcharge directe"
        case .testThenPromote: return "S2 teste +1 cran, succès → promotion"
        case .voluntaryCap: return "Reps plafonnées à voluntaryRepCap"
        }
    }
}
