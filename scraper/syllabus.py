"""GATE 2027 CS syllabus (IIT Madras, official PDFs in data/raw/2026-11/syllabus/) and the mapping
from practicepaper.in tags to syllabus sections/topics. Used by build_db.py.

Practicepaper groups questions by its own subjects (e.g. probability sits under "Discrete Mathematics",
hashing under "Data Structure"). We re-file every question under the official syllabus section, keep
practicepaper's fine topics where they fit, and mark topics the 2027 syllabus no longer lists.
"""

PDFS = {
    "cs": "https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/CS_GATE2027_Syllabus.pdf",
    "ga": "https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/GA_GATE2027_Syllabus.pdf",
}
EXAM = "GATE 2027 CS syllabus (IIT Madras)"

# practicepaper subject -> syllabus section name
SUBJECT = {
    "General Aptitude": "General Aptitude",
    "Discrete Mathematics": "Engineering Mathematics",
    "Engineering Mathematics": "Engineering Mathematics",
    "Digital Logic": "Digital Logic",
    "Computer Organization": "Computer Organization and Architecture",
    "C Programming": "Programming and Data Structures",
    "Data Structure": "Programming and Data Structures",
    "Algorithm": "Algorithms",
    "Theory of Computation": "Theory of Computation",
    "Compiler Design": "Compiler Design",
    "Operating System": "Operating System",
    "Database Management System": "Databases",
    "Computer Network": "Computer Networks",
    "Software Engg": "Software Engineering",
    "Software Engineering": "Software Engineering",
    "Web Technology": "Web Technology",
}

# (practicepaper subject, practicepaper topic) -> (section, topic). Unlisted pairs keep their topic name.
TOPIC = {
    ("Discrete Mathematics", "Probability Theory"): ("Engineering Mathematics", "Probability and Statistics"),
    ("Engineering Mathematics", "Probability Theory"): ("Engineering Mathematics", "Probability and Statistics"),
    ("Discrete Mathematics", "Combination"): ("Engineering Mathematics", "Combinatorics"),
    ("Discrete Mathematics", "Recurrence Relation"): ("Engineering Mathematics", "Combinatorics"),
    ("Discrete Mathematics", "Planar Graph"): ("Engineering Mathematics", "Graph Theory"),
    ("Discrete Mathematics", "Matching"): ("Engineering Mathematics", "Graph Theory"),
    ("Discrete Mathematics", "Lattice"): ("Engineering Mathematics", "Relation"),
    ("Discrete Mathematics", "Discrete Mathematics"): ("Engineering Mathematics", "Other discrete maths"),
    ("Engineering Mathematics", "Engineering Mathematics"): ("Engineering Mathematics", "Other discrete maths"),
    ("Engineering Mathematics", "Numerical Method"): ("Engineering Mathematics", "Numerical Methods"),
    ("C Programming", "Arithmetic Operation"): ("Programming and Data Structures", "C: Operators and Expressions"),
    ("C Programming", "Array and Pointer"): ("Programming and Data Structures", "C: Arrays and Pointers"),
    ("C Programming", "Conditional Statement"): ("Programming and Data Structures", "C: Conditionals"),
    ("C Programming", "Function"): ("Programming and Data Structures", "C: Functions and Recursion"),
    ("C Programming", "Loop"): ("Programming and Data Structures", "C: Loops"),
    ("C Programming", "C Programming"): ("Programming and Data Structures", "C: Mixed"),
    ("Data Structure", "Hashing"): ("Algorithms", "Hashing"),
    ("Data Structure", "B Tree"): ("Databases", "B / B+ Tree Indexing"),
    ("Data Structure", "B plus Tree"): ("Databases", "B / B+ Tree Indexing"),
    ("Data Structure", "N-ary Tree"): ("Programming and Data Structures", "Binary Tree"),
    ("Data Structure", "n-ary Tree"): ("Programming and Data Structures", "Binary Tree"),
    ("Software Engg", "Software Engg"): ("Software Engineering", "Software Engineering"),
    ("Data Structure", "Data Structure"): ("Programming and Data Structures", "Mixed data structures"),
    ("Database Management System", "File System"): ("Databases", "File Organization and Indexing"),
    ("Database Management System", "Database Management System"): ("Databases", "Mixed DBMS"),
    ("Compiler Design", "Matching"): ("Compiler Design", "Compiler Phases (mixed)"),
    ("Compiler Design", "Compiler Design"): ("Compiler Design", "Compiler Phases (mixed)"),
    ("Computer Network", "OSI Layer"): ("Computer Networks", "Layering (OSI / TCP-IP)"),
    ("Computer Network", "Physical Layer"): ("Computer Networks", "Switching and Performance"),
    ("Computer Network", "Computer Network"): ("Computer Networks", "Mixed networks"),
    ("Operating System", "Operating System"): ("Operating System", "Mixed OS"),
    ("Computer Organization", "Computer Organization"): ("Computer Organization and Architecture", "Mixed COA"),
    ("Digital Logic", "Digital Logic"): ("Digital Logic", "Mixed digital logic"),
    ("Algorithm", "Algorithm"): ("Algorithms", "Mixed algorithms"),
    ("Theory of Computation", "Theory of Computation"): ("Theory of Computation", "Mixed TOC"),
}

# Questions practicepaper filed under the wrong subject (checked by hand against the question text).
QUESTION = {
    # "linear list based directory implementation in a file system" is an OS file-system question
    "2021-1-15": ("Operating System", "File System"),
}

# Topics that appear in past papers but are not in the GATE 2027 syllabus.
OUT_OF_SYLLABUS = {
    ("Computer Networks", "Network Security"),
    ("Engineering Mathematics", "Numerical Methods"),
    ("Algorithms", "P-NP Theory"),
    ("Software Engineering", "*"),
    ("Web Technology", "*"),
}

# Official syllabus text, split into lines; each line lists the (section, topic) pairs that test it.
EM, DL, COA, PDS, ALG, TOC, CD, OS, DB, CN, GA = (
    "Engineering Mathematics", "Digital Logic", "Computer Organization and Architecture",
    "Programming and Data Structures", "Algorithms", "Theory of Computation", "Compiler Design",
    "Operating System", "Databases", "Computer Networks", "General Aptitude")

SECTIONS = [
    {"id": "S1", "name": EM, "groups": [
        {"name": "Discrete Mathematics", "items": [
            ("Propositional and first order logic.", [(EM, "Propositional Logic")]),
            ("Sets, relations, functions, partial orders and lattices.", [(EM, "Set Theory"), (EM, "Relation"), (EM, "Function")]),
            ("Monoids, Groups.", [(EM, "Group Theory")]),
            ("Graphs: connectivity, matching, colouring.", [(EM, "Graph Theory")]),
            ("Combinatorics: counting, recurrence relations, generating functions.", [(EM, "Combinatorics"), (EM, "Other discrete maths")]),
        ]},
        {"name": "Linear Algebra", "items": [
            ("Matrices, determinants, system of linear equations, eigenvalues and eigenvectors, LU decomposition.", [(EM, "Linear Algebra")]),
        ]},
        {"name": "Calculus", "items": [
            ("Limits, continuity and differentiability, Maxima and minima, Mean value theorem, Integration.", [(EM, "Calculus")]),
        ]},
        {"name": "Probability and Statistics", "items": [
            ("Random variables, Uniform, normal, exponential, Poisson and binomial distributions. Mean, median, mode and standard deviation. Conditional probability and Bayes theorem.", [(EM, "Probability and Statistics")]),
        ]},
    ]},
    {"id": "S2", "name": DL, "groups": [{"name": None, "items": [
        ("Boolean algebra and minimization – algebraic technique, Karnaugh map, tabular method.", [(DL, "Boolean Algebra")]),
        ("Design of combinational and sequential circuits.", [(DL, "Combinational Circuit"), (DL, "Sequential Circuit"), (DL, "Mixed digital logic")]),
        ("Number representation and arithmetic (fixed and floating point).", [(DL, "Number System")]),
    ]}]},
    {"id": "S3", "name": COA, "groups": [{"name": None, "items": [
        ("Instruction set and addressing modes.", [(COA, "Machine Instruction"), (COA, "Addressing Modes")]),
        ("Design of arithmetic and logic unit (ALU). Design of control unit – hardwired and microprogrammed.", [(COA, "ALU Data Path and Control Unit")]),
        ("Memory interfacing and hierarchy: performance, cache memory mapping.", [(COA, "Cache Memory"), (COA, "Memory Chip Design"), (COA, "Secondary Storage")]),
        ("I/O interface (interrupt and DMA).", [(COA, "IO Interface"), (COA, "Interrupt")]),
        ("Instruction pipelining, pipeline hazards.", [(COA, "Pipeline Processor"), (COA, "Mixed COA")]),
    ]}]},
    {"id": "S4", "name": PDS, "groups": [{"name": None, "items": [
        ("Programming in C.", [(PDS, "C: Operators and Expressions"), (PDS, "C: Conditionals"), (PDS, "C: Loops"), (PDS, "C: Arrays and Pointers"), (PDS, "C: Mixed")]),
        ("Recursion.", [(PDS, "C: Functions and Recursion")]),
        ("Arrays, stacks, queues, linked lists.", [(PDS, "Array"), (PDS, "Stack"), (PDS, "Queue"), (PDS, "Link List")]),
        ("Trees, binary search trees, binary heaps.", [(PDS, "Binary Tree"), (PDS, "Binary Search Tree"), (PDS, "AVL Tree"), (PDS, "Heap Tree")]),
        ("Graphs.", [(PDS, "Graph"), (PDS, "Mixed data structures")]),
    ]}]},
    {"id": "S5", "name": ALG, "groups": [{"name": None, "items": [
        ("Searching, sorting, hashing.", [(ALG, "Sorting"), (ALG, "Searching"), (ALG, "Hashing")]),
        ("Asymptotic worst case time and space complexity.", [(ALG, "Asymptotic Notation"), (ALG, "Recurrence Relation"), (ALG, "Mixed algorithms")]),
        ("Algorithm design techniques: greedy, dynamic programming and divide-and-conquer.", [(ALG, "Greedy Technique"), (ALG, "Dynamic Programming"), (ALG, "Divide and Conquer")]),
        ("Graph traversals, minimum spanning trees, shortest paths.", [(ALG, "Graph Traversal"), (ALG, "Minimum Spanning Tree"), (ALG, "Shortest Path")]),
    ]}]},
    {"id": "S6", "name": TOC, "groups": [{"name": None, "items": [
        ("Regular expressions and finite automata.", [(TOC, "Regular Expression"), (TOC, "Finite Automata")]),
        ("Context-free grammars and push-down automata.", [(TOC, "Context Free Grammar"), (TOC, "Push-down Automata")]),
        ("Regular and context-free languages, pumping lemma.", [(TOC, "Regular Language"), (TOC, "Context Free Language"), (TOC, "Regular Grammar")]),
        ("Turing machines and undecidability.", [(TOC, "Turing Machine"), (TOC, "Undecidability"), (TOC, "Recursive Language"), (TOC, "Mixed TOC")]),
    ]}]},
    {"id": "S7", "name": CD, "groups": [{"name": None, "items": [
        ("Lexical analysis, parsing, syntax-directed translation.", [(CD, "Lexical Analysis"), (CD, "Parsing"), (CD, "Syntax-directed Translation"), (CD, "Compiler Phases (mixed)")]),
        ("Runtime environments.", [(CD, "Runtime Environment")]),
        ("Intermediate code generation.", [(CD, "Intermediate Code Generation")]),
        ("Local optimisation, Data flow analyses: constant propagation, liveness analysis, common sub expression elimination.", [(CD, "Code Optimization"), (CD, "Intermediate Code Generation")]),
    ]}]},
    {"id": "S8", "name": OS, "groups": [{"name": None, "items": [
        ("System calls, processes, threads, inter-process communication, concurrency and synchronization.", [(OS, "System Call"), (OS, "Process"), (OS, "Thread"), (OS, "Process Synchronization"), (OS, "Mixed OS")]),
        ("Deadlock.", [(OS, "Deadlock")]),
        ("CPU and I/O scheduling.", [(OS, "CPU Scheduling"), (OS, "Disk Scheduling")]),
        ("Memory management and virtual memory.", [(OS, "Memory Management")]),
        ("File systems.", [(OS, "File System")]),
    ]}]},
    {"id": "S9", "name": DB, "groups": [{"name": None, "items": [
        ("ER-model.", [(DB, "ER Model")]),
        ("Relational model: relational algebra, tuple calculus, SQL.", [(DB, "Relational Algebra"), (DB, "Tuple Calculus"), (DB, "SQL")]),
        ("Integrity constraints, normal forms.", [(DB, "Integrity Constraints"), (DB, "Normal Form"), (DB, "Relational Schema"), (DB, "Mixed DBMS")]),
        ("File organization, indexing (e.g., B and B+ trees).", [(DB, "File Organization and Indexing"), (DB, "B / B+ Tree Indexing")]),
        ("Transactions and concurrency control.", [(DB, "Transaction")]),
    ]}]},
    {"id": "S10", "name": CN, "groups": [{"name": None, "items": [
        ("Principles of Layering.", [(CN, "Layering (OSI / TCP-IP)")]),
        ("Basics of switching (circuit, packet and virtual circuit) and performance metrics.", [(CN, "Switching and Performance"), (CN, "Mixed networks")]),
        ("Data link layer: error detection, Medium Access Control, Ethernet.", [(CN, "Data Link Layer")]),
        ("Distance vector and link state routing; IPv4 - Fragmentation, CIDR Notation, Network Address Translation.", [(CN, "Network Layer Protocol")]),
        ("TCP - flow control and congestion control, socket API.", [(CN, "Transport Layer Protocol")]),
        ("DNS and HTTP.", [(CN, "Application Layer Protocols")]),
    ]}]},
    {"id": "GA", "name": GA, "groups": [
        {"name": "Verbal Aptitude", "items": [
            ("Basic English grammar: tenses, articles, adjectives, prepositions, conjunctions, verb-noun agreement, and other parts of speech. Basic vocabulary: words, idioms, and phrases in context. Reading and comprehension, Narrative sequencing.", [(GA, "Verbal Ability")]),
        ]},
        {"name": "Quantitative, Analytical and Spatial Aptitude", "items": [
            ("Data interpretation: data graphs (bar graphs, pie charts, and other graphs representing data), 2- and 3-dimensional plots, maps, and tables.", [(GA, "Numerical Ability")]),
            ("Numerical computation and estimation: ratios, percentages, powers, exponents and logarithms, permutations and combinations, and series. Mensuration and geometry, Elementary statistics and probability.", [(GA, "Numerical Ability")]),
            ("Logic: deduction and induction, Analogy, Numerical relations and reasoning.", [(GA, "Numerical Ability")]),
            ("Transformation of shapes: translation, rotation, scaling, mirroring, assembling, and grouping paper folding, cutting, and patterns in 2 and 3 dimensions.", [(GA, "Numerical Ability")]),
        ]},
    ]},
]


_TOPIC_LC = {(a.lower(), b.lower()): v for (a, b), v in TOPIC.items()}
_SUBJECT_LC = {k.lower(): v for k, v in SUBJECT.items()}


def remap(qid, pp_subject, pp_topic):
    """Case-insensitive: practicepaper spells some tags in more than one case."""
    if qid in QUESTION:
        return QUESTION[qid]
    key = (pp_subject.lower(), pp_topic.lower())
    if key in _TOPIC_LC:
        return _TOPIC_LC[key]
    return _SUBJECT_LC.get(pp_subject.lower(), pp_subject), pp_topic


def in_syllabus(section, topic):
    return (section, topic) not in OUT_OF_SYLLABUS and (section, "*") not in OUT_OF_SYLLABUS
