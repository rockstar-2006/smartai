// src/pages/ResultsPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quizAPI } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Users, Clock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface QuizWithStats {
  _id: string;
  title: string;
  description?: string;
  duration?: number | null;
  createdAt: string;
  attemptCount: number;
  submittedCount: number;
  averageScore?: number;
}

export default function ResultsPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuizzesWithStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchQuizzesWithStats = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      // Primary attempt: aggregated stats endpoint
      const data = await quizAPI.getAllWithStats();
      // normalize returned items to QuizWithStats shape (defensive)
      const normalized = (data || []).map((q: any) => ({
        _id: q._id,
        title: q.title,
        description: q.description || '',
        duration: q.duration ?? null,
        createdAt: q.createdAt,
        attemptCount: typeof q.attemptCount === 'number' ? q.attemptCount : 0,
        submittedCount: typeof q.submittedCount === 'number' ? q.submittedCount : 0,
        averageScore: typeof q.averageScore === 'number' ? q.averageScore : undefined
      })) as QuizWithStats[];

      setQuizzes(normalized);
    } catch (err: any) {
      console.error('Error fetching quiz results:', err);

      // Auth errors -> redirect to login
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        toast.error('Your session has expired. Please log in again.');
        navigate('/login');
        return;
      }

      // If endpoint missing (404) or other server error, fallback to /quiz/all (no stats)
      if (status === 404) {
        try {
          const all = await quizAPI.getAll();
          const mapped = (all || []).map((q: any) => ({
            _id: q._id,
            title: q.title,
            description: q.description || '',
            duration: q.duration ?? null,
            createdAt: q.createdAt,
            attemptCount: 0,
            submittedCount: 0,
            averageScore: undefined
          })) as QuizWithStats[];
          setQuizzes(mapped);
          toast('Loaded quizzes (no stats available).');
        } catch (innerErr) {
          console.error('Fallback /quiz/all failed:', innerErr);
          setLoadError('Failed to load quizzes.');
          toast.error('Failed to load quiz results');
        }
      } else {
        // Generic error
        setLoadError('Failed to load quiz results');
        toast.error('Failed to load quiz results');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewResults = (quizId: string) => {
    navigate(`/quiz/${quizId}/results`);
  };

  const handleRetry = () => {
    fetchQuizzesWithStats();
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Quiz Results</h1>
          <p className="text-muted-foreground">
            View and manage results for all your quizzes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleRetry} variant="ghost">
            Refresh
          </Button>
        </div>
      </div>

      {loadError ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Could not load results</h3>
              <p className="text-muted-foreground mb-4">{loadError}</p>
              <div className="flex justify-center gap-2">
                <Button onClick={handleRetry}>Retry</Button>
                <Button variant="outline" onClick={() => navigate('/create-quiz')}>
                  Create Quiz
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : quizzes.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Quiz Results Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create and share quizzes to see student results here
              </p>
              <Button onClick={() => navigate('/create-quiz')}>
                Create Your First Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => (
            <Card
              key={quiz._id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleViewResults(quiz._id)}
            >
              <CardHeader>
                <CardTitle className="flex items-start gap-2">
                  <FileText className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{quiz.title}</span>
                </CardTitle>
                {quiz.description && (
                  <CardDescription className="line-clamp-2">
                    {quiz.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {quiz.attemptCount} {quiz.attemptCount === 1 ? 'attempt' : 'attempts'}
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {quiz.submittedCount} submitted
                    </span>
                  </div>

                  {quiz.duration != null && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {quiz.duration} minutes
                      </span>
                    </div>
                  )}

                  {quiz.averageScore !== undefined && quiz.submittedCount > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Avg: {quiz.averageScore.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  <Button
                    className="w-full mt-4"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewResults(quiz._id);
                    }}
                  >
                    View Results
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
