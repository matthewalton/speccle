import Testing

@Suite struct LadderClimb {
  @Test("[LADDER-2] the top rung reports the climb finished")
  func topRungFinishesTheClimb() {
    #expect(Ladder(rungs: 1).completeRung().isFinished)
  }
}
