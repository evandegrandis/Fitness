import Foundation
import SwiftData

/// Explicit, persistent superset pairing. Replaces the brittle
/// `LoggedExercise.isLinkedToNext` flag: membership is now modelled by a
/// first-class relationship, so:
///   - Moving an exercise never "smears" a link onto the wrong neighbour.
///   - Analytics + exports can iterate real supersets instead of walking
///     neighbouring exercises and checking an adjacency bit.
///   - A logged set can tag which round of the superset it belongs to via
///     `LoggedSet.supersetRoundIndex`.
///
/// A group owns an ordered list of member exercises (`memberOrder` keyed by
/// `LoggedExercise.id`). We store the order explicitly so two members with the
/// same `orderIndex` don't flicker within the group during rapid reorders.
@Model
final class SupersetGroup {
    @Attribute(.unique) var id: UUID

    /// Position of the whole group inside its session. When rendering, we
    /// interleave standalone exercises and groups using this value.
    var orderIndex: Int

    /// Stable order of the members inside this group. A LoggedExercise.id is
    /// considered a member iff its UUID appears here AND its `supersetGroup`
    /// points back to this group.
    var memberOrder: [UUID]

    @Relationship var session: WorkoutSession?

    /// Inverse of `LoggedExercise.supersetGroup`. SwiftData manages the
    /// back-reference, so the authoritative order is `memberOrder`.
    @Relationship(deleteRule: .nullify, inverse: \LoggedExercise.supersetGroup)
    var members: [LoggedExercise]

    init(
        id: UUID = UUID(),
        orderIndex: Int = 0,
        memberOrder: [UUID] = [],
        session: WorkoutSession? = nil,
        members: [LoggedExercise] = []
    ) {
        self.id = id
        self.orderIndex = orderIndex
        self.memberOrder = memberOrder
        self.session = session
        self.members = members
    }

    /// Members in their explicit intra-group order. Falls back to
    /// `LoggedExercise.orderIndex` if a member id is missing from
    /// `memberOrder` (safety net if the array ever drifts).
    var orderedMembers: [LoggedExercise] {
        let byID = Dictionary(uniqueKeysWithValues: members.map { ($0.id, $0) })
        var result: [LoggedExercise] = memberOrder.compactMap { byID[$0] }
        let listedIDs = Set(memberOrder)
        let extras = members.filter { !listedIDs.contains($0.id) }
            .sorted { $0.orderIndex < $1.orderIndex }
        result.append(contentsOf: extras)
        return result
    }

    /// Number of completed rounds (i.e. min completed work-set count across members).
    /// Drives `supersetRoundIndex` when the user logs the next set.
    var completedRounds: Int {
        guard !members.isEmpty else { return 0 }
        return members.map(\.completedWorkSets.count).min() ?? 0
    }
}
