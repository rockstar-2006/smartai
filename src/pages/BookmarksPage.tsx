import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Trash2, FileEdit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { bookmarksAPI } from '@/services/api';

export default function BookmarksPage() {
  const navigate = useNavigate();
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookmarks();
  }, []);

  const fetchBookmarks = async () => {
    try {
      const data = await bookmarksAPI.getAll();
      setBookmarkedQuestions(data.bookmarks || []);
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
      toast.error('Failed to load bookmarks');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    try {
      await bookmarksAPI.delete(id);
      setBookmarkedQuestions(bookmarkedQuestions.filter(q => q._id !== id));
      toast.success('Bookmark removed');
    } catch (error) {
      console.error('Error deleting bookmark:', error);
      toast.error('Failed to delete bookmark');
    }
  };

  const handleEditInQuiz = (question: any) => {
    navigate('/create-quiz', { state: { editQuestion: question } });
    toast.info('Opening question in Create Quiz page');
  };

  if (loading) {
    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-fade-in max-w-6xl mx-auto">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading bookmarks...</p>
        </div>
      </div>
    );
  }

  const filteredQuestions = bookmarkedQuestions.filter(q => {
    if (filterType === 'all') return true;
    return q.question?.type === filterType;
  });

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-fade-in max-w-6xl mx-auto">
      <div className="space-y-1 md:space-y-2">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Bookmarked Questions
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Manage your saved questions and edit them in Create Quiz
        </p>
      </div>

      <Card className="shadow-card">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-primary">{bookmarkedQuestions.length}</p>
                <p className="text-xs text-muted-foreground">Total Bookmarks</p>
              </div>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px] h-9 text-xs md:text-sm">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="mcq">MCQ Only</SelectItem>
                <SelectItem value="short-answer">Short Answer Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {filteredQuestions.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-16">
            <div className="text-center space-y-3">
              <Bookmark className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground mx-auto opacity-50" />
              <div>
                <h3 className="text-lg md:text-xl font-semibold">No bookmarked questions yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Start bookmarking questions from the Create Quiz page
                </p>
              </div>
              <Button onClick={() => navigate('/create-quiz')} className="mt-4 gradient-primary hover-scale">
                Go to Create Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 md:space-y-4">
          {filteredQuestions.map((bookmark, index) => {
            const question = bookmark.question;
            return (
              <Card key={bookmark._id} className="shadow-card hover-scale transition-all animate-fade-in">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={question.type === 'mcq' ? 'default' : 'secondary'} className="text-xs">
                          {question.type === 'mcq' ? 'MCQ' : 'Short Answer'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Question #{index + 1}</span>
                      </div>
                      <CardTitle className="text-base md:text-lg leading-relaxed">
                        {question.question}
                      </CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/10 hover:text-primary" onClick={() => handleEditInQuiz(question)}>
                        <FileEdit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteBookmark(bookmark._id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {question.type === 'mcq' && question.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {question.options.map((option: string, idx: number) => (
                        <div key={idx} className={`p-2 md:p-3 rounded-lg border text-xs md:text-sm ${
                            String.fromCharCode(65 + idx) === question.answer ? 'bg-primary/10 border-primary font-medium' : 'bg-muted/50 border-border'
                          }`}>
                          <span className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</span>
                          {option}
                        </div>
                      ))}
                    </div>
                  )}
                  {question.explanation && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border">
                      <p className="text-xs font-semibold mb-1">Explanation:</p>
                      <p className="text-xs md:text-sm text-muted-foreground">{question.explanation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
