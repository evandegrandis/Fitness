import SwiftUI
import SwiftData

struct QuickStartView: View {
    @Bindable var viewModel: WorkoutViewModel
    @Query(
        filter: #Predicate<WorkoutSession> { !$0.isActive },
        sort: \WorkoutSession.startTime,
        order: .reverse
    ) private var recentSessions: [WorkoutSession]
    @Query(sort: \WorkoutTemplate.sortOrder) private var templates: [WorkoutTemplate]

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 6) {
                    Text("Jeera")
                        .font(.largeTitle.weight(.bold))
                    Text(Date().relativeDay)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 20)

                // Quick Actions
                VStack(spacing: 12) {
                    QuickStartButton(
                        title: "Empty Workout",
                        subtitle: "Start from scratch",
                        icon: "plus.circle.fill",
                        color: .accentColor
                    ) {
                        viewModel.startEmptyWorkout()
                    }

                    if !recentSessions.isEmpty {
                        QuickStartButton(
                            title: "Repeat Last",
                            subtitle: lastWorkoutSubtitle,
                            icon: "arrow.counterclockwise.circle.fill",
                            color: .blue
                        ) {
                            viewModel.repeatLastWorkout()
                        }
                    }
                }
                .padding(.horizontal)

                // Templates
                if !templates.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Templates")
                            .font(.headline)
                            .padding(.horizontal)

                        ForEach(templates) { template in
                            TemplateRow(template: template) {
                                viewModel.startFromTemplate(template)
                            }
                        }
                        .padding(.horizontal)
                    }
                }

                // Recent Workouts
                if !recentSessions.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent")
                            .font(.headline)
                            .padding(.horizontal)

                        ForEach(recentSessions.prefix(5)) { session in
                            RecentWorkoutRow(session: session)
                        }
                        .padding(.horizontal)
                    }
                }

                Spacer(minLength: 80)
            }
        }
    }

    private var lastWorkoutSubtitle: String {
        guard let last = recentSessions.first else { return "" }
        let exercises = last.orderedExercises.compactMap { $0.exercise?.name }
        let preview = exercises.prefix(2).joined(separator: ", ")
        let more = exercises.count > 2 ? " +\(exercises.count - 2)" : ""
        return "\(last.date.relativeDay) - \(preview)\(more)"
    }
}

struct QuickStartButton: View {
    let title: String
    let subtitle: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(color)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .glassCard()
        }
        .buttonStyle(.plain)
    }
}

struct TemplateRow: View {
    let template: WorkoutTemplate
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(template.name)
                        .font(.subheadline.weight(.semibold))
                    Text("\(template.templateExercises.count) exercises")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "play.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.accentColor)
            }
            .glassCard(padding: 14)
        }
        .buttonStyle(.plain)
    }
}

struct RecentWorkoutRow: View {
    let session: WorkoutSession

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.date.relativeDay)
                    .font(.subheadline.weight(.medium))
                Text("\(session.totalWorkSets) sets \u{2022} \(session.durationFormatted)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(session.date.shortTime)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .glassCard(padding: 12)
    }
}
