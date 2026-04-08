import SwiftUI
import SwiftData

struct ExerciseCard: View {
    @Bindable var loggedExercise: LoggedExercise
    @Bindable var viewModel: WorkoutViewModel
    @State private var isExpanded = true
    @State private var editWeight: Double = 0
    @State private var editReps: Int = 0
    @State private var hasLoadedSuggestion = false

    private var exercise: Exercise? { loggedExercise.exercise }

    private var suggestion: SetSuggestion {
        viewModel.suggestion(for: loggedExercise)
    }

    var body: some View {
        VStack(spacing: 0) {
            GlassCard(padding: 0, cornerRadius: 20) {
                VStack(spacing: 0) {
                    // Header
                    cardHeader
                        .padding(.horizontal, 16)
                        .padding(.top, 14)
                        .padding(.bottom, isExpanded ? 8 : 14)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                isExpanded.toggle()
                                HapticManager.tap()
                            }
                        }

                    if isExpanded {
                        Divider().background(.white.opacity(0.1))

                        // Logged sets with swipe-to-delete
                        if !loggedExercise.orderedSets.isEmpty {
                            setsSection
                        }

                        // Inline editing area
                        inlineEditSection
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)

                        // Live muscle impact (compact)
                        if !loggedExercise.completedWorkSets.isEmpty {
                            liveImpactSection
                                .padding(.horizontal, 16)
                                .padding(.bottom, 12)
                        }
                    }
                }
            }

            // Superset link indicator
            if loggedExercise.isLinkedToNext {
                HStack {
                    Rectangle()
                        .fill(Color.accentColor.opacity(0.4))
                        .frame(width: 2, height: 20)
                    Text("superset")
                        .font(.caption2)
                        .foregroundStyle(Color.accentColor.opacity(0.6))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 32)
            }
        }
        .onAppear {
            if !hasLoadedSuggestion {
                let s = suggestion
                editWeight = s.weight
                editReps = s.reps
                hasLoadedSuggestion = true
            }
        }
        .onChange(of: loggedExercise.sets.count) {
            let s = suggestion
            editWeight = s.weight
            editReps = s.reps
        }
        .contextMenu {
            Button {
                viewModel.toggleSuperset(loggedExercise)
            } label: {
                Label(
                    loggedExercise.isLinkedToNext ? "Unlink Superset" : "Link as Superset",
                    systemImage: loggedExercise.isLinkedToNext ? "link.badge.plus" : "link"
                )
            }
            Button(role: .destructive) {
                withAnimation { viewModel.removeExercise(loggedExercise) }
            } label: {
                Label("Remove Exercise", systemImage: "trash")
            }
        }
    }

    // MARK: - Header

    private var cardHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(exercise?.name ?? "Unknown")
                        .font(.headline)
                        .lineLimit(1)
                    if loggedExercise.isLinkedToNext {
                        Image(systemName: "link")
                            .font(.caption2)
                            .foregroundStyle(Color.accentColor.opacity(0.6))
                    }
                }

                HStack(spacing: 8) {
                    if let ex = exercise {
                        Text(ex.repTargetDisplay + " reps")
                            .font(.caption2)
                            .foregroundStyle(.secondary)

                        Text("·")
                            .foregroundStyle(.tertiary)

                        Text(ex.isBigExercise ? "\(ex.suggestedRestSeconds)s rest" : "\(ex.suggestedRestSeconds)s rest")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            if !loggedExercise.completedWorkSets.isEmpty {
                Text("\(loggedExercise.completedWorkSets.count)")
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
            }

            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    // MARK: - Sets List

    private var setsSection: some View {
        VStack(spacing: 0) {
            ForEach(loggedExercise.orderedSets) { set in
                SetRow(set: set)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.deleteSet(set, from: loggedExercise)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
    }

    // MARK: - Inline Edit (replaces old suggestion + sheet)

    private var inlineEditSection: some View {
        VStack(spacing: 10) {
            // Explanation
            Text(suggestion.explanation)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(2)

            HStack(spacing: 8) {
                // Weight controls
                if exercise?.setPatternMode != .bodyweight {
                    HStack(spacing: 4) {
                        Button {
                            editWeight = max(0, editWeight - (exercise?.smallestIncrement ?? 2.5))
                            HapticManager.tap()
                        } label: {
                            Image(systemName: "minus")
                                .font(.caption.weight(.bold))
                                .frame(width: 36, height: 36)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .buttonStyle(.plain)

                        Text(editWeight > 0 ? editWeight.cleanWeight : "BW")
                            .font(.title3.weight(.bold).monospacedDigit())
                            .frame(minWidth: 44)

                        Button {
                            editWeight += exercise?.smallestIncrement ?? 2.5
                            HapticManager.tap()
                        } label: {
                            Image(systemName: "plus")
                                .font(.caption.weight(.bold))
                                .frame(width: 36, height: 36)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .buttonStyle(.plain)
                    }

                    Text("x")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Reps controls
                HStack(spacing: 4) {
                    Button {
                        editReps = max(1, editReps - 1)
                        HapticManager.tap()
                    } label: {
                        Image(systemName: "minus")
                            .font(.caption.weight(.bold))
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)

                    Text("\(editReps)")
                        .font(.title3.weight(.bold).monospacedDigit())
                        .frame(minWidth: 28)

                    Button {
                        editReps += 1
                        HapticManager.tap()
                    } label: {
                        Image(systemName: "plus")
                            .font(.caption.weight(.bold))
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                // LOG button
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        viewModel.logSet(for: loggedExercise, weight: editWeight, reps: editReps)
                    }
                } label: {
                    Text("LOG")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }

            // Quick actions row
            HStack(spacing: 8) {
                // Repeat last
                if let lastSet = loggedExercise.lastCompletedSet {
                    Button {
                        editWeight = lastSet.weight
                        editReps = lastSet.reps
                        HapticManager.selection()
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.caption2)
                            Text(lastSet.weight > 0 ? "\(lastSet.weight.cleanWeight)x\(lastSet.reps)" : "BWx\(lastSet.reps)")
                                .font(.caption2.weight(.semibold).monospacedDigit())
                        }
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }

                // Reset to suggestion
                Button {
                    let s = suggestion
                    editWeight = s.weight
                    editReps = s.reps
                    HapticManager.selection()
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "sparkles")
                            .font(.caption2)
                        Text("Suggested")
                            .font(.caption2.weight(.medium))
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                .buttonStyle(.plain)

                Spacer()
            }
        }
    }

    // MARK: - Live Impact

    private var liveImpactSection: some View {
        let impact = exercise.map {
            EffectiveSetsEngine.liveImpact(exercise: $0, completedSets: loggedExercise.completedWorkSets.count)
        } ?? [:]

        return Group {
            if !impact.isEmpty {
                HStack(spacing: 10) {
                    ForEach(impact.sorted(by: { $0.value > $1.value }), id: \.key) { muscle, sets in
                        HStack(spacing: 2) {
                            Text(muscle.displayName)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                            Text("+\(sets, specifier: "%.1f")")
                                .font(.caption2.weight(.semibold).monospacedDigit())
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

// MARK: - Set Row

struct SetRow: View {
    let set: LoggedSet

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Color.accentColor)
                .frame(width: 5, height: 5)

            Text("#\(set.setSlotIndex + 1)")
                .font(.caption.weight(.medium).monospacedDigit())
                .foregroundStyle(.tertiary)
                .frame(width: 24, alignment: .leading)

            if set.weight > 0 {
                Text(set.weight.cleanWeight)
                    .font(.subheadline.weight(.bold).monospacedDigit())
                Text("x")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text("\(set.reps)")
                    .font(.subheadline.weight(.bold).monospacedDigit())
            } else {
                Text("BW")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("x")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text("\(set.reps)")
                    .font(.subheadline.weight(.bold).monospacedDigit())
            }

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 7)
    }
}
