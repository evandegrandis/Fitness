import SwiftUI
import SwiftData

struct ExerciseCard: View {
    @Bindable var loggedExercise: LoggedExercise
    @Bindable var viewModel: WorkoutViewModel
    @State private var isExpanded = true
    @State private var editWeight: Double = 0
    @State private var editReps: Int = 0
    @State private var hasLoadedSuggestion = false
    @State private var showWeightEntry = false
    @State private var showRepsEntry = false
    @State private var weightText = ""
    @State private var repsText = ""
    @State private var editingSet: LoggedSet?
    @State private var showEditSetAlert = false
    @State private var editSetWeight = ""
    @State private var editSetReps = ""
    @State private var cachedSuggestion = SetSuggestion(weight: 0, reps: 10, setType: .work, explanation: "")

    private var exercise: Exercise? { loggedExercise.exercise }

    private func refreshSuggestion() {
        cachedSuggestion = viewModel.suggestion(for: loggedExercise)
    }

    var body: some View {
        VStack(spacing: 0) {
            GlassCard(padding: 0, cornerRadius: 18) {
                VStack(spacing: 0) {
                    // Header (compact)
                    cardHeader
                        .padding(.horizontal, 14)
                        .padding(.top, 12)
                        .padding(.bottom, isExpanded ? 6 : 12)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                isExpanded.toggle()
                                HapticManager.tap()
                            }
                        }

                    if isExpanded {
                        Divider().background(.white.opacity(0.08))

                        // Logged sets (compact rows)
                        if !loggedExercise.orderedSets.isEmpty {
                            setsSection
                        }

                        // Inline editing area
                        inlineEditSection
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                    }
                }
            }

            // Superset link indicator
            if loggedExercise.isLinkedToNext {
                HStack {
                    Rectangle()
                        .fill(Color.accentColor.opacity(0.4))
                        .frame(width: 2, height: 16)
                    Text("superset")
                        .font(.caption2)
                        .foregroundStyle(Color.accentColor.opacity(0.6))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 30)
            }
        }
        .onAppear {
            if !hasLoadedSuggestion {
                refreshSuggestion()
                editWeight = cachedSuggestion.weight
                editReps = cachedSuggestion.reps
                hasLoadedSuggestion = true
            }
        }
        .onChange(of: loggedExercise.sets.count) {
            refreshSuggestion()
            editWeight = cachedSuggestion.weight
            editReps = cachedSuggestion.reps
        }
        .contextMenu {
            Button {
                viewModel.toggleSuperset(loggedExercise)
            } label: {
                Label(
                    loggedExercise.isLinkedToNext ? "Délier superset" : "Lier en superset",
                    systemImage: loggedExercise.isLinkedToNext ? "link.badge.plus" : "link"
                )
            }
            Button {
                viewModel.duplicateExercise(loggedExercise)
            } label: {
                Label("Dupliquer", systemImage: "doc.on.doc")
            }
            Button(role: .destructive) {
                withAnimation { viewModel.removeExercise(loggedExercise) }
            } label: {
                Label("Supprimer", systemImage: "trash")
            }
        }
        .alert("Poids (kg)", isPresented: $showWeightEntry) {
            TextField("0", text: $weightText)
                .keyboardType(.decimalPad)
            Button("OK") {
                if let val = Double(weightText.replacingOccurrences(of: ",", with: ".")) {
                    editWeight = val
                }
            }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Reps", isPresented: $showRepsEntry) {
            TextField("0", text: $repsText)
                .keyboardType(.numberPad)
            Button("OK") {
                if let val = Int(repsText) {
                    editReps = max(1, val)
                }
            }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Modifier le set", isPresented: $showEditSetAlert) {
            TextField("Poids", text: $editSetWeight)
                .keyboardType(.decimalPad)
            TextField("Reps", text: $editSetReps)
                .keyboardType(.numberPad)
            Button("OK") {
                if let set = editingSet,
                   let w = Double(editSetWeight.replacingOccurrences(of: ",", with: ".")),
                   let r = Int(editSetReps) {
                    viewModel.editSet(set, weight: w, reps: max(1, r))
                }
                editingSet = nil
            }
            Button("Annuler", role: .cancel) { editingSet = nil }
        }
    }

    // MARK: - Header

    private var cardHeader: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(exercise?.name ?? "Unknown")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if loggedExercise.isLinkedToNext {
                        Image(systemName: "link")
                            .font(.caption2)
                            .foregroundStyle(Color.accentColor.opacity(0.6))
                    }
                }

                HStack(spacing: 6) {
                    if let ex = exercise {
                        Text(ex.setPatternMode.shortName)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                        Text(ex.repTargetDisplay + "r")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        if !ex.machineSetting.isEmpty {
                            Text(ex.machineSetting)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }

            Spacer()

            // Completed count badge
            if !loggedExercise.completedWorkSets.isEmpty {
                Text("\(loggedExercise.completedWorkSets.count)")
                    .font(.callout.weight(.bold).monospacedDigit())
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 26, height: 26)
                    .background(Color.accentColor.opacity(0.15), in: Circle())
            }

            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    // MARK: - Sets List (compact)

    private var setsSection: some View {
        VStack(spacing: 0) {
            ForEach(loggedExercise.orderedSets) { set in
                CompactSetRow(set: set) {
                    // Tap to edit logged set
                    editingSet = set
                    editSetWeight = set.weight > 0 ? set.weight.cleanWeight : "0"
                    editSetReps = "\(set.reps)"
                    showEditSetAlert = true
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        withAnimation(.spring(response: 0.3)) {
                            viewModel.deleteSet(set, from: loggedExercise)
                        }
                    } label: {
                        Label("Supprimer", systemImage: "trash")
                    }
                }
            }
        }
    }

    // MARK: - Inline Edit Section

    private var inlineEditSection: some View {
        VStack(spacing: 8) {
            // Suggestion explanation
            Text(cachedSuggestion.explanation)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(2)

            HStack(spacing: 6) {
                // Weight controls (tap number for direct entry)
                if exercise?.setPatternMode != .bodyweight {
                    HStack(spacing: 3) {
                        Button {
                            editWeight = max(0, editWeight - (exercise?.smallestIncrement ?? 2.5))
                            HapticManager.tap()
                        } label: {
                            Image(systemName: "minus")
                                .font(.caption.weight(.bold))
                                .frame(width: 32, height: 32)
                                .background(Color.white.opacity(0.12), in: Circle())
                        }
                        .buttonStyle(.plain)

                        // Tappable weight value
                        Button {
                            weightText = editWeight > 0 ? editWeight.cleanWeight : ""
                            showWeightEntry = true
                        } label: {
                            Text(editWeight > 0 ? editWeight.cleanWeight : "BW")
                                .font(.title3.weight(.bold).monospacedDigit())
                                .frame(minWidth: 40)
                                .padding(.vertical, 4)
                                .padding(.horizontal, 6)
                                .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)

                        Button {
                            editWeight += exercise?.smallestIncrement ?? 2.5
                            HapticManager.tap()
                        } label: {
                            Image(systemName: "plus")
                                .font(.caption.weight(.bold))
                                .frame(width: 32, height: 32)
                                .background(Color.white.opacity(0.12), in: Circle())
                        }
                        .buttonStyle(.plain)
                    }

                    Text("x")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                // Reps controls (tap number for direct entry)
                HStack(spacing: 3) {
                    Button {
                        editReps = max(1, editReps - 1)
                        HapticManager.tap()
                    } label: {
                        Image(systemName: "minus")
                            .font(.caption.weight(.bold))
                            .frame(width: 32, height: 32)
                            .background(Color.white.opacity(0.12), in: Circle())
                    }
                    .buttonStyle(.plain)

                    // Tappable reps value
                    Button {
                        repsText = "\(editReps)"
                        showRepsEntry = true
                    } label: {
                        Text("\(editReps)")
                            .font(.title3.weight(.bold).monospacedDigit())
                            .frame(minWidth: 28)
                            .padding(.vertical, 4)
                            .padding(.horizontal, 6)
                            .background(Color.accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)

                    Button {
                        editReps += 1
                        HapticManager.tap()
                    } label: {
                        Image(systemName: "plus")
                            .font(.caption.weight(.bold))
                            .frame(width: 32, height: 32)
                            .background(Color.white.opacity(0.12), in: Circle())
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                // LOG button (passes setType from suggestion)
                Button {
                    withAnimation(.spring(response: 0.3)) {
                        viewModel.logSet(for: loggedExercise, weight: editWeight, reps: editReps, setType: cachedSuggestion.setType)
                    }
                } label: {
                    Text("LOG")
                        .font(.subheadline.weight(.heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }

            // Quick actions row
            HStack(spacing: 6) {
                if let lastSet = loggedExercise.lastCompletedSet {
                    Button {
                        editWeight = lastSet.weight
                        editReps = lastSet.reps
                        HapticManager.selection()
                    } label: {
                        HStack(spacing: 2) {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.system(size: 8))
                            Text(lastSet.weight > 0 ? "\(lastSet.weight.cleanWeight)x\(lastSet.reps)" : "BWx\(lastSet.reps)")
                                .font(.caption2.weight(.semibold).monospacedDigit())
                        }
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(Color.white.opacity(0.10), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    refreshSuggestion()
                    editWeight = cachedSuggestion.weight
                    editReps = cachedSuggestion.reps
                    HapticManager.selection()
                } label: {
                    HStack(spacing: 2) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 8))
                        Text("Suggéré")
                            .font(.caption2.weight(.medium))
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color.white.opacity(0.10), in: Capsule())
                }
                .buttonStyle(.plain)

                Spacer()
            }

            // Scrollable muscle impact strip (all muscles)
            if !loggedExercise.completedWorkSets.isEmpty, let ex = exercise {
                let impact = EffectiveSetsEngine.liveImpact(exercise: ex, completedSets: loggedExercise.completedWorkSets.count)
                let sorted = impact.sorted(by: { $0.value > $1.value })
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(sorted, id: \.key) { muscle, sets in
                            HStack(spacing: 2) {
                                Text(muscle.displayName)
                                    .font(.system(size: 9).weight(.medium))
                                Text("+\(sets, specifier: "%.1f")")
                                    .font(.system(size: 9).weight(.bold).monospacedDigit())
                                    .foregroundStyle(sets >= 1 ? Color.accentColor : Color.secondary.opacity(0.4))
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, 3)
                            .background(Color.white.opacity(0.08), in: Capsule())
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Compact Set Row

struct CompactSetRow: View {
    let set: LoggedSet
    var onTap: () -> Void = {}

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                // Set type indicator
                setTypeLabel
                    .frame(width: 18, alignment: .center)

                Text("#\(set.setSlotIndex + 1)")
                    .font(.caption2.weight(.medium).monospacedDigit())
                    .foregroundStyle(.tertiary)
                    .frame(width: 18, alignment: .leading)

                if set.weight > 0 {
                    Text(set.weight.cleanWeight)
                        .font(.caption.weight(.bold).monospacedDigit())
                    Text("x")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                    Text("\(set.reps)")
                        .font(.caption.weight(.bold).monospacedDigit())
                } else {
                    Text("BW")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("x")
                        .font(.system(size: 9))
                        .foregroundStyle(.tertiary)
                    Text("\(set.reps)")
                        .font(.caption.weight(.bold).monospacedDigit())
                }

                Spacer()

                Image(systemName: "checkmark")
                    .font(.system(size: 9).weight(.bold))
                    .foregroundStyle(.green.opacity(0.7))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 5)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var setTypeLabel: some View {
        switch set.setType {
        case .topSet:
            Text("T")
                .font(.system(size: 9).weight(.bold))
                .foregroundStyle(.orange)
        case .backoff:
            Text("B")
                .font(.system(size: 9).weight(.bold))
                .foregroundStyle(.blue)
        case .warmup:
            Text("W")
                .font(.system(size: 9).weight(.bold))
                .foregroundStyle(.yellow)
        case .work:
            Circle()
                .fill(Color.accentColor.opacity(0.5))
                .frame(width: 4, height: 4)
        }
    }
}
