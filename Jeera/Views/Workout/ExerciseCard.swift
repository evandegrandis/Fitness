import SwiftUI
import SwiftData

struct ExerciseCard: View {
    @Bindable var loggedExercise: LoggedExercise
    @Bindable var viewModel: WorkoutViewModel
    @State private var isExpanded = true
    @State private var showAdjustSheet = false
    @State private var adjustWeight: Double = 0
    @State private var adjustReps: Int = 0
    @State private var adjustSetType: SetType = .work

    private var exercise: Exercise? { loggedExercise.exercise }
    private var suggestion: SetSuggestion {
        viewModel.suggestion(for: loggedExercise)
    }

    var body: some View {
        GlassCard(padding: 0, cornerRadius: 20) {
            VStack(spacing: 0) {
                // Header - always visible
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
                    Divider()
                        .background(.white.opacity(0.1))

                    // Logged sets
                    if !loggedExercise.orderedSets.isEmpty {
                        setsSection
                    }

                    // Suggestion + Actions
                    suggestionSection
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)

                    // Live muscle impact
                    if !loggedExercise.completedWorkSets.isEmpty {
                        liveImpactSection
                            .padding(.horizontal, 16)
                            .padding(.bottom, 14)
                    }
                }
            }
        }
        .sheet(isPresented: $showAdjustSheet) {
            AdjustSetSheet(
                weight: $adjustWeight,
                reps: $adjustReps,
                setType: $adjustSetType,
                exercise: exercise,
                onLog: {
                    viewModel.logCustomSet(
                        for: loggedExercise,
                        weight: adjustWeight,
                        reps: adjustReps,
                        setType: adjustSetType
                    )
                    showAdjustSheet = false
                }
            )
            .presentationDetents([.height(320)])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Header

    private var cardHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(exercise?.name ?? "Unknown")
                    .font(.headline)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    if let ex = exercise {
                        Text(ex.setPatternMode.shortName)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.accentColor.opacity(0.2), in: Capsule())

                        Text(ex.repTargetDisplay + " reps")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    Text("\(loggedExercise.completedWorkSets.count) sets done")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            // Completion indicator
            if !loggedExercise.completedWorkSets.isEmpty {
                Text("\(loggedExercise.completedWorkSets.count)")
                    .font(.title3.weight(.bold).monospacedDigit())
                    .foregroundStyle(.accentColor)
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

    // MARK: - Suggestion

    private var suggestionSection: some View {
        VStack(spacing: 10) {
            // Suggestion explanation
            Text(suggestion.explanation)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(2)

            HStack(spacing: 10) {
                // One-tap log suggestion
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        viewModel.logSet(for: loggedExercise, suggestion: suggestion)
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark")
                            .font(.caption.weight(.bold))
                        if suggestion.weight > 0 {
                            Text("\(suggestion.weight.cleanWeight)x\(suggestion.reps)")
                                .font(.subheadline.weight(.bold).monospacedDigit())
                        } else {
                            Text("BWx\(suggestion.reps)")
                                .font(.subheadline.weight(.bold).monospacedDigit())
                        }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.accentColor, in: Capsule())
                }
                .buttonStyle(.plain)

                // Repeat last set
                if let lastSet = loggedExercise.lastCompletedSet {
                    Button {
                        if let repeat_ = ProgressionEngine.repeatLastSet(from: loggedExercise.orderedSets) {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.logSet(for: loggedExercise, suggestion: repeat_)
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.caption2)
                            if lastSet.weight > 0 {
                                Text("\(lastSet.weight.cleanWeight)x\(lastSet.reps)")
                                    .font(.caption.weight(.semibold).monospacedDigit())
                            } else {
                                Text("BWx\(lastSet.reps)")
                                    .font(.caption.weight(.semibold).monospacedDigit())
                            }
                        }
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }

                // Custom adjust
                Button {
                    adjustWeight = suggestion.weight
                    adjustReps = suggestion.reps
                    adjustSetType = suggestion.setType
                    showAdjustSheet = true
                } label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .frame(width: 40, height: 36)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
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
                HStack(spacing: 12) {
                    ForEach(impact.sorted(by: { $0.value > $1.value }), id: \.key) { muscle, sets in
                        HStack(spacing: 3) {
                            Text(muscle.displayName)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text("+\(sets, specifier: "%.1f")")
                                .font(.caption2.weight(.semibold).monospacedDigit())
                                .foregroundStyle(.accentColor)
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
        HStack(spacing: 12) {
            // Set type indicator
            if !set.setType.shortLabel.isEmpty {
                Text(set.setType.shortLabel)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 16)
            } else {
                Circle()
                    .fill(.accentColor)
                    .frame(width: 6, height: 6)
                    .frame(width: 16)
            }

            // Set number
            Text("#\(set.setSlotIndex + 1)")
                .font(.caption.weight(.medium).monospacedDigit())
                .foregroundStyle(.tertiary)
                .frame(width: 28, alignment: .leading)

            // Weight x Reps
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

            if set.completed {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}

// MARK: - Adjust Set Sheet

struct AdjustSetSheet: View {
    @Binding var weight: Double
    @Binding var reps: Int
    @Binding var setType: SetType
    let exercise: Exercise?
    let onLog: () -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text(exercise?.name ?? "Adjust Set")
                    .font(.headline)

                ValueStepper(
                    label: "Weight",
                    value: $weight,
                    step: exercise?.smallestIncrement ?? 2.5,
                    unit: "kg"
                )

                RepStepper(
                    label: "Reps",
                    value: $reps
                )

                // Set Type Picker
                HStack(spacing: 8) {
                    ForEach([SetType.work, .topSet, .backoff, .warmup], id: \.self) { type in
                        Button {
                            setType = type
                            HapticManager.selection()
                        } label: {
                            Text(type.displayName)
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    setType == type ? Color.accentColor.opacity(0.3) : Color.clear,
                                    in: Capsule()
                                )
                                .overlay {
                                    Capsule()
                                        .stroke(.white.opacity(setType == type ? 0.3 : 0.1), lineWidth: 0.5)
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Button(action: onLog) {
                    Text("Log Set")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(.accentColor, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)

                Spacer()
            }
            .padding(20)
        }
        .presentationBackground(.ultraThinMaterial)
    }
}
