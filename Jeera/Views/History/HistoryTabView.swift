import SwiftUI
import SwiftData

struct HistoryTabView: View {
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var sessions: [WorkoutSession]

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                if sessions.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.largeTitle)
                            .foregroundStyle(.tertiary)
                        Text("Pas encore de séance")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("Tes séances terminées apparaîtront ici.")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            ForEach(sessions) { session in
                                NavigationLink {
                                    WorkoutDetailView(session: session)
                                } label: {
                                    HistoryRow(session: session)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 12)
                        .padding(.bottom, 80)
                    }
                }
            }
            .navigationTitle("Historique")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct HistoryRow: View {
    let session: WorkoutSession

    private var exerciseNames: String {
        let names = session.orderedExercises.compactMap { $0.exercise?.name }
        if names.count <= 3 {
            return names.joined(separator: ", ")
        }
        return names.prefix(3).joined(separator: ", ") + " +\(names.count - 3)"
    }

    var body: some View {
        GlassCard(padding: 12, cornerRadius: 14) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(session.date.relativeDay)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(session.date.shortTime)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                HStack(spacing: 10) {
                    Label("\(session.totalWorkSets) sets", systemImage: "checkmark.circle")
                    Label(session.durationFormatted, systemImage: "clock")
                    Label("\(session.orderedExercises.count) exos", systemImage: "dumbbell")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)

                Text(exerciseNames)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
    }
}
