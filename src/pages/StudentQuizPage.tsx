// src/pages/StudentQuizPage.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface Question {
  id: string;
  type: 'mcq' | 'short-answer';
  question: string;
  options?: string[];
}

interface Quiz {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  numQuestions?: number;
  questions?: Question[];
}

export default function StudentQuizPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [email, setEmail] = useState('');

  // Student info form
  const [showInfoForm, setShowInfoForm] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentUSN, setStudentUSN] = useState('');
  const [studentBranch, setStudentBranch] = useState('');
  const [studentYear, setStudentYear] = useState('');
  const [studentSemester, setStudentSemester] = useState('');

  // Quiz state
  const [quizStarted, setQuizStarted] = useState(false);
  const [attemptId, setAttemptId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Anti-cheat refs/state
  const wakeLockRef = useRef<any>(null);
  const violationCountRef = useRef<number>(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const maxViolations = 1; // strict: first violation => auto-submit
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    fetchQuizData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (quizStarted && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Time's up -> auto-submit
            autoSubmitDueToTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [quizStarted, timeLeft]);

  const ensureAnswersLength = (len: number) => {
    setAnswers((prev) => {
      if (!prev || prev.length !== len) {
        return new Array(len).fill('');
      }
      return prev;
    });
  };

  // ---------- Fetch quiz data (first token preview, then attempt state) ----------
  const fetchQuizData = async () => {
    setLoading(true);
    setNotFound(false);

    try {
      // 1) Try preview endpoint to quickly get quiz metadata + email
      try {
        const previewRes = await axios.get(`${API_URL}/student-quiz/token/${token}`);
        if (previewRes?.data?.quiz) {
          setQuiz(previewRes.data.quiz);
          if (previewRes.data.email) setEmail(previewRes.data.email);
        }
      } catch (previewErr) {
        // preview may 404 if not implemented; ignore and continue to attempt endpoint below
        // console.warn('Preview endpoint failed:', previewErr?.response?.data || previewErr.message);
      }

      // 2) Check attempt state (in-progress / already submitted / not started)
      const response = await axios.get(`${API_URL}/student-quiz/attempt/${token}`);
      const data = response.data;

      if (data.alreadySubmitted) {
        toast({
          title: 'Quiz Already Submitted',
          description: 'You have already completed this quiz.',
          variant: 'destructive',
        });
        setQuizSubmitted(true);
        setLoading(false);
        return;
      }

      // If attempt returned a quiz payload, use it (this contains questions if started/resuming)
      if (data.quiz) {
        setQuiz((prev) => data.quiz || prev);
      } else if (!quiz) {
        // If neither preview nor attempt provided quiz metadata -> not found
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (data.email) setEmail(data.email);

      const qlen = (data.quiz?.questions && data.quiz.questions.length) || quiz?.numQuestions || quiz?.questions?.length || 0;
      ensureAnswersLength(qlen);

      if (data.hasStarted && data.attemptId) {
        setAttemptId(data.attemptId);
        setQuizStarted(true);

        if (data.studentInfo) {
          if (data.studentInfo.name) setStudentName(data.studentInfo.name);
          if (data.studentInfo.usn) setStudentUSN(data.studentInfo.usn);
          if (data.studentInfo.branch) setStudentBranch(data.studentInfo.branch);
          if (data.studentInfo.year) setStudentYear(data.studentInfo.year);
          if (data.studentInfo.semester) setStudentSemester(data.studentInfo.semester);
        }

        setTimeLeft(((data.quiz?.duration || quiz?.duration || 30) as number) * 60);
        startAntiCheat();
      } else {
        // not started yet: show info form
        setShowInfoForm(true);
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Error fetching quiz:', error);
      const message = error.response?.data?.message || error.message || 'Failed to load quiz';
      if (error.response?.status === 404 || error.response?.status === 403) {
        setNotFound(true);
      }
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  // ---------- Fullscreen / Wake Lock / Orientation helpers ----------
  const enterFullscreen = async () => {
    try {
      const el: any = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
        setIsFullscreen(true);
      }
    } catch (e) {
      console.warn('requestFullscreen failed', e);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
    } catch (e) {
      // ignore
    } finally {
      setIsFullscreen(false);
    }
  };

  const requestWakeLock = async () => {
    try {
      // @ts-ignore
      if ('wakeLock' in navigator) {
        // @ts-ignore
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake lock released');
        });
        console.log('Wake lock acquired');
      }
    } catch (e) {
      console.warn('wake lock failed', e);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (e) {
      console.warn('release wake lock failed', e);
    }
  };

  const lockOrientation = async () => {
    try {
      // prefer portrait on mobile
      // @ts-ignore
      if (screen.orientation && screen.orientation.lock) {
        // @ts-ignore
        await screen.orientation.lock('portrait').catch(() => {});
      }
    } catch (e) {
      // ignore
    }
  };

  const unlockOrientation = async () => {
    try {
      // @ts-ignore
      if (screen.orientation && screen.orientation.unlock) {
        // @ts-ignore
        screen.orientation.unlock();
      }
    } catch (e) {
      // ignore
    }
  };

  // ---------- Anti-cheat listeners ----------
  const preventCopyHandler = (e: Event) => {
    if (!quizStarted) return;
    try {
      e.preventDefault();
    } catch {}
    return false;
  };

  const preventContextMenu = (e: Event) => {
    if (!quizStarted) return;
    try {
      e.preventDefault();
    } catch {}
    return false;
  };

  const onVisibilityChange = () => {
    if (!quizStarted) return;
    if (document.visibilityState !== 'visible') {
      handleViolation('visibilitychange');
    }
  };

  const onWindowBlur = () => {
    if (!quizStarted) return;
    handleViolation('blur');
  };

  const onSelectionChange = () => {
    if (!quizStarted) return;
    try {
      const sel = window.getSelection ? window.getSelection() : null;
      const len = sel ? sel.toString().length : 0;
      if (len > 0) {
        handleViolation('text-selection');
      }
    } catch {}
  };

  const onKeyDownPrevent = (e: KeyboardEvent) => {
    if (!quizStarted) return;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrl = isMac ? e.metaKey : e.ctrlKey;

    // Block copy/paste/select shortcuts and devtools
    if ((ctrl && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'a')) ||
        e.key === 'F12' ||
        (ctrl && e.key === 'Tab') // try to catch tab switching (best-effort)
    ) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch {}
      if (e.key === 'Tab' && ctrl) handleViolation('ctrl+tab');
      if (e.key === 'F12') handleViolation('f12/devtools');
      return false;
    }
  };

  const startAntiCheat = () => {
    // add CSS class to prevent selection (you should add CSS in global file)
    document.documentElement.classList.add('quiz-active-no-select');

    // event listeners
    document.addEventListener('copy', preventCopyHandler);
    document.addEventListener('cut', preventCopyHandler);
    document.addEventListener('paste', preventCopyHandler);
    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKeyDownPrevent);

    // request wake lock & lock orientation
    requestWakeLock();
    lockOrientation();
  };

  const stopAntiCheat = () => {
    document.documentElement.classList.remove('quiz-active-no-select');

    document.removeEventListener('copy', preventCopyHandler);
    document.removeEventListener('cut', preventCopyHandler);
    document.removeEventListener('paste', preventCopyHandler);
    document.removeEventListener('contextmenu', preventContextMenu);
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('keydown', onKeyDownPrevent);

    releaseWakeLock();
    unlockOrientation();
    // optionally exit fullscreen on completion
  };

  // ---------- Violation handling ----------
  const handleViolation = (reason?: string) => {
    violationCountRef.current += 1;
    const v = violationCountRef.current;
    console.warn('Violation detected:', reason, 'count=', v);

    setShowViolationWarning(true);
    setTimeout(() => setShowViolationWarning(false), 3000);

    if (v >= maxViolations) {
      // auto-submit immediately
      autoSubmitDueToViolation(reason);
    }
  };

  // ---------- Start quiz ----------
  const handleStartQuiz = async () => {
    if (!studentName.trim() || !studentUSN.trim() || !studentBranch || !studentYear || !studentSemester) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // try to request fullscreen on user gesture
      try {
        await enterFullscreen();
      } catch (e) {
        // ignore
      }

      const response = await axios.post(`${API_URL}/student-quiz/attempt/start`, {
        token,
        studentName,
        studentUSN,
        studentBranch,
        studentYear,
        studentSemester,
      });

      setAttemptId(response.data.attemptId);
      setQuiz(response.data.quiz);

      const qlen = response.data.quiz.questions?.length || response.data.quiz.numQuestions || 0;
      ensureAnswersLength(qlen);

      setTimeLeft(((response.data.quiz.duration || 30) as number) * 60);
      setQuizStarted(true);
      setShowInfoForm(false);

      // start anti-cheat protections
      startAntiCheat();

      toast({
        title: 'Quiz Started',
        description: 'Fullscreen and anti-copy protections are enabled.',
      });
    } catch (error: any) {
      console.error('Error starting quiz:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to start quiz',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------- Normal submit ----------
  const handleSubmitQuiz = async () => {
    if (submitting || quizSubmitted) return;
    if (!attemptId) {
      toast({ title: 'No attempt', description: 'Attempt ID missing', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // prepare answers (fill empties)
      const qlen = (quiz?.questions?.length) || 0;
      const prepared = answers.slice(0, qlen);
      while (prepared.length < qlen) prepared.push('');

      const response = await axios.post(`${API_URL}/student-quiz/attempt/submit`, {
        attemptId,
        answers: prepared,
        autoSubmitted: false,
        violations: violationCountRef.current,
      });

      setQuizSubmitted(true);
      toast({
        title: 'Quiz Submitted Successfully',
        description: `You scored ${response.data.results.totalMarks}/${response.data.results.maxMarks} (${response.data.results.percentage}%)`,
      });

      // cleanup
      stopAntiCheat();
      try { await exitFullscreen(); } catch {}
    } catch (error: any) {
      console.error('Error submitting quiz:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to submit quiz',
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  };

  // ---------- Auto-submit due to violation ----------
  const autoSubmitDueToViolation = async (reason?: string) => {
    if (submitting || quizSubmitted) return;
    if (!attemptId) {
      // can't auto-submit if attempt not yet created
      toast({
        title: 'Auto-submit blocked',
        description: 'Attempt not initialized; please start the quiz first.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const qlen = (quiz?.questions?.length) || 0;
      const prepared = answers.slice(0, qlen);
      while (prepared.length < qlen) prepared.push('');

      await axios.post(`${API_URL}/student-quiz/attempt/submit`, {
        attemptId,
        answers: prepared,
        autoSubmitted: true,
        violations: violationCountRef.current,
        violationReason: reason || 'violation',
      });

      setQuizSubmitted(true);
      toast({
        title: 'Auto-submitted',
        description: 'Your quiz was auto-submitted due to policy violation.',
        variant: 'destructive',
      });

      stopAntiCheat();
      try { await exitFullscreen(); } catch {}
    } catch (err: any) {
      console.error('Auto-submit failed:', err);
      toast({
        title: 'Error',
        description: err?.response?.data?.message || 'Auto-submit failed',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const autoSubmitDueToTimeout = async () => {
    if (submitting || quizSubmitted) return;
    if (!attemptId) return;
    setSubmitting(true);
    try {
      const qlen = (quiz?.questions?.length) || 0;
      const prepared = answers.slice(0, qlen);
      while (prepared.length < qlen) prepared.push('');

      await axios.post(`${API_URL}/student-quiz/attempt/submit`, {
        attemptId,
        answers: prepared,
        autoSubmitted: true,
        violations: violationCountRef.current,
        violationReason: 'timeout',
      });

      setQuizSubmitted(true);
      toast({
        title: 'Time up',
        description: 'Quiz submitted automatically after time expired.',
      });

      stopAntiCheat();
      try { await exitFullscreen(); } catch {}
    } catch (err: any) {
      console.error('Timeout submit failed', err);
      toast({
        title: 'Error',
        description: 'Failed to submit after timeout',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswerChange = (value: string) => {
    setAnswers((prev) => {
      const copy = [...prev];
      copy[currentQuestion] = value;
      return copy;
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ---------- UI ----------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <CardTitle>Quiz Not Found</CardTitle>
            <CardDescription>
              The quiz link is invalid, revoked, or has expired.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (quizSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Quiz Submitted!</CardTitle>
            <CardDescription>
              Thank you for completing the quiz. Your teacher will review your responses.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const ViolationBanner = () => (
    showViolationWarning ? (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded shadow">
        Policy violation detected — quiz will be submitted.
      </div>
    ) : null
  );

  if (showInfoForm && quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{quiz.title}</CardTitle>
            <CardDescription>
              {quiz.description || 'Please enter your details to start the quiz'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Enter your full name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="usn">USN *</Label>
              <Input id="usn" value={studentUSN} onChange={(e) => setStudentUSN(e.target.value.toUpperCase())} placeholder="e.g., 1AB21CS001" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch">Branch *</Label>
              <Select value={studentBranch} onValueChange={setStudentBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSE">Computer Science Engineering</SelectItem>
                  <SelectItem value="ISE">Artificial Intelligence And Data Science </SelectItem>
                  <SelectItem value="ECE">Artificial Intelligence And Machine learning </SelectItem>
                  <SelectItem value="EEE">Electrical & Electronics</SelectItem>
                  <SelectItem value="ME">Mechanical Engineering</SelectItem>
                  <SelectItem value="CE">Civil Engineering</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year *</Label>
                <Select value={studentYear} onValueChange={setStudentYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Year</SelectItem>
                    <SelectItem value="2">2nd Year</SelectItem>
                    <SelectItem value="3">3rd Year</SelectItem>
                    <SelectItem value="4">4th Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="semester">Semester *</Label>
                <Select value={studentSemester} onValueChange={setStudentSemester}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                      <SelectItem key={sem} value={sem.toString()}>
                        {sem}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <p><strong>Important:</strong> The quiz will open fullscreen and copying or switching apps/tabs will trigger automatic submission.</p>
              {isIOS && <p className="text-yellow-600">iOS Safari has limited support for fullscreen and wake-lock; Chrome on Android works best.</p>}
            </div>

            <Button onClick={handleStartQuiz} className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Quiz'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (quizStarted && quiz.questions) {
    const question = quiz.questions[currentQuestion];
    const progress = ((currentQuestion + 1) / quiz.questions.length) * 100;

    return (
      <div className="min-h-screen bg-background">
        <ViolationBanner />

        {!isFullscreen && (
          <div className="fixed top-4 right-4 z-40 bg-yellow-600 text-black px-3 py-2 rounded">Please enable fullscreen</div>
        )}

        <div className="bg-card border-b sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-xl font-bold">{quiz.title}</h1>
                <p className="text-sm text-muted-foreground">{studentName} ({studentUSN})</p>
              </div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Clock className={`h-5 w-5 ${timeLeft < 300 ? 'text-destructive' : 'text-primary'}`} />
                <span className={timeLeft < 300 ? 'text-destructive' : 'text-foreground'}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Question {currentQuestion + 1} of {quiz.questions.length}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Question {currentQuestion + 1}</CardTitle>
              <CardDescription className="text-base text-foreground pt-2">{question.question}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {question.type === 'mcq' && question.options ? (
                <RadioGroup value={answers[currentQuestion] ?? ''} onValueChange={handleAnswerChange}>
                  {question.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                      <RadioGroupItem value={String.fromCharCode(65 + index)} id={`option-${index}`} />
                      <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">
                        <span className="font-semibold mr-2">{String.fromCharCode(65 + index)}.</span>
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="answer">Your Answer</Label>
                  <Textarea id="answer" value={answers[currentQuestion] ?? ''} onChange={(e) => handleAnswerChange(e.target.value)} placeholder="Type your answer here..." rows={6} />
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))} disabled={currentQuestion === 0}>Previous</Button>

                {currentQuestion === quiz.questions.length - 1 ? (
                  <Button onClick={handleSubmitQuiz} disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Submit Quiz'
                    )}
                  </Button>
                ) : (
                  <Button onClick={() => setCurrentQuestion(Math.min(quiz.questions.length - 1, currentQuestion + 1))}>Next</Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">Question Navigator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-10 gap-2">
                {quiz.questions.map((_, index) => (
                  <Button key={index} variant={currentQuestion === index ? 'default' : answers[index] ? 'secondary' : 'outline'} size="sm" onClick={() => setCurrentQuestion(index)} className="w-full aspect-square">
                    {index + 1}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}
